import { describe, test, expect } from 'vitest'
import { parseUserMessageAttachments } from '@/lib/parse-user-message-attachments'

describe('parseUserMessageAttachments', () => {
  test('returns empty arrays and original text when no XML tags present', () => {
    const result = parseUserMessageAttachments('hello world')
    expect(result).toEqual({
      tickets: [],
      prComments: [],
      files: [],
      dataAttachments: [],
      diffComments: [],
      cleanText: 'hello world'
    })
  })

  test('extracts a single <ticket> tag', () => {
    const input = '<ticket title="mul_1240">\nadd another function - mul_1240 which accepts x and returns x * 1240\n</ticket>\nwhat does the ticket want us to do?'
    const result = parseUserMessageAttachments(input)

    expect(result.tickets).toEqual([
      { title: 'mul_1240', description: 'add another function - mul_1240 which accepts x and returns x * 1240' }
    ])
    expect(result.cleanText.trim()).toBe('what does the ticket want us to do?')
  })

  test('extracts multiple <ticket> tags', () => {
    const input = '<ticket title="auth">\nlogin flow\n</ticket>\n<ticket title="dashboard">\nbuild dashboard\n</ticket>\nwork on these'
    const result = parseUserMessageAttachments(input)

    expect(result.tickets).toHaveLength(2)
    expect(result.tickets[0].title).toBe('auth')
    expect(result.tickets[1].title).toBe('dashboard')
    expect(result.cleanText.trim()).toBe('work on these')
  })

  test('handles XML-escaped title attributes', () => {
    const input = '<ticket title="fix &amp; improve &lt;auth&gt;">\ndescription\n</ticket>\ndo it'
    const result = parseUserMessageAttachments(input)

    expect(result.tickets[0].title).toBe('fix & improve <auth>')
    expect(result.cleanText.trim()).toBe('do it')
  })

  test('extracts a single <pr-comment> tag', () => {
    const input = '<pr-comment author="octocat" file="src/auth.ts" line="42">\nThis needs error handling\n<diff-hunk>@@ -40,3 +40,5 @@\n+const user = getUser()\n</diff-hunk>\n</pr-comment>\nplease fix this'
    const result = parseUserMessageAttachments(input)

    expect(result.prComments).toEqual([
      {
        author: 'octocat',
        file: 'src/auth.ts',
        line: '42',
        body: 'This needs error handling',
        diffHunk: '@@ -40,3 +40,5 @@\n+const user = getUser()'
      }
    ])
    expect(result.cleanText.trim()).toBe('please fix this')
  })

  test('extracts <pr-comment> with file-level line', () => {
    const input = '<pr-comment author="dev" file="README.md" line="file-level">\nUpdate docs\n<diff-hunk>some diff</diff-hunk>\n</pr-comment>\ncheck this'
    const result = parseUserMessageAttachments(input)

    expect(result.prComments[0].line).toBe('file-level')
    expect(result.cleanText.trim()).toBe('check this')
  })

  test('extracts <attached_files> block with multiple files', () => {
    const input = '<attached_files>\n<file path="/src/utils.ts">utils.ts</file>\n<file path="/src/index.ts">index.ts</file>\n</attached_files>\nreview these files'
    const result = parseUserMessageAttachments(input)

    expect(result.files).toEqual([
      { path: '/src/utils.ts', name: 'utils.ts' },
      { path: '/src/index.ts', name: 'index.ts' }
    ])
    expect(result.cleanText.trim()).toBe('review these files')
  })

  test('extracts all three tag types in one message', () => {
    const input = [
      '<pr-comment author="alice" file="api.ts" line="10">\nfix this\n<diff-hunk>diff</diff-hunk>\n</pr-comment>',
      '<ticket title="bug_fix">\nfix the login bug\n</ticket>',
      '<attached_files>\n<file path="/f.ts">f.ts</file>\n</attached_files>',
      'please handle all of these'
    ].join('\n')
    const result = parseUserMessageAttachments(input)

    expect(result.tickets).toHaveLength(1)
    expect(result.prComments).toHaveLength(1)
    expect(result.files).toHaveLength(1)
    expect(result.cleanText.trim()).toBe('please handle all of these')
  })

  test('preserves text between tags', () => {
    const input = 'before\n<ticket title="t1">\ndesc\n</ticket>\nmiddle\n<ticket title="t2">\ndesc2\n</ticket>\nafter'
    const result = parseUserMessageAttachments(input)

    expect(result.tickets).toHaveLength(2)
    expect(result.cleanText).toContain('before')
    expect(result.cleanText).toContain('middle')
    expect(result.cleanText).toContain('after')
  })

  test('trims body and description whitespace', () => {
    const input = '<ticket title="t1">\n  spaced description  \n</ticket>\nquestion'
    const result = parseUserMessageAttachments(input)

    expect(result.tickets[0].description).toBe('spaced description')
  })

  test('extracts a single diff comment', () => {
    const input = '<diff-comments>\n<diff-comment file="main.py" lines="11" outdated="false">\n<snippet><![CDATA[def mul_233(x):]]></snippet>\n<body><![CDATA[change this to 254]]></body>\n</diff-comment>\n</diff-comments>\napply the comments'
    const result = parseUserMessageAttachments(input)

    expect(result.diffComments).toEqual([
      {
        file: 'main.py',
        lines: '11',
        outdated: false,
        snippet: 'def mul_233(x):',
        body: 'change this to 254'
      }
    ])
    expect(result.cleanText.trim()).toBe('apply the comments')
  })

  test('extracts multiple diff comments in one block', () => {
    const input = '<diff-comments>\n<diff-comment file="main.py" lines="11" outdated="false">\n<snippet><![CDATA[def mul_233(x):]]></snippet>\n<body><![CDATA[change this to 254]]></body>\n</diff-comment>\n<diff-comment file="main.py" lines="15" outdated="false">\n<snippet><![CDATA[def mul_334(x):]]></snippet>\n<body><![CDATA[change this to 450]]></body>\n</diff-comment>\n</diff-comments>\napply both'
    const result = parseUserMessageAttachments(input)

    expect(result.diffComments).toHaveLength(2)
    expect(result.diffComments[0].lines).toBe('11')
    expect(result.diffComments[0].body).toBe('change this to 254')
    expect(result.diffComments[1].lines).toBe('15')
    expect(result.diffComments[1].body).toBe('change this to 450')
    expect(result.cleanText.trim()).toBe('apply both')
  })

  test('parses outdated flag as boolean', () => {
    const input = '<diff-comments>\n<diff-comment file="old.ts" lines="5" outdated="true">\n<snippet><![CDATA[old code]]></snippet>\n<body><![CDATA[fix this]]></body>\n</diff-comment>\n</diff-comments>\ncheck'
    const result = parseUserMessageAttachments(input)

    expect(result.diffComments[0].outdated).toBe(true)
  })

  test('handles empty snippet (null anchor_text)', () => {
    const input = '<diff-comments>\n<diff-comment file="file.ts" lines="1" outdated="false">\n<snippet><![CDATA[]]></snippet>\n<body><![CDATA[add something here]]></body>\n</diff-comment>\n</diff-comments>\ndo it'
    const result = parseUserMessageAttachments(input)

    expect(result.diffComments[0].snippet).toBe('')
    expect(result.diffComments[0].body).toBe('add something here')
  })

  test('handles CDATA with escaped ]]> sequences', () => {
    const input = '<diff-comments>\n<diff-comment file="test.ts" lines="3" outdated="false">\n<snippet><![CDATA[code with ]]]]><![CDATA[> in it]]></snippet>\n<body><![CDATA[fix the ]]]]><![CDATA[> issue]]></body>\n</diff-comment>\n</diff-comments>\nfix'
    const result = parseUserMessageAttachments(input)

    expect(result.diffComments[0].snippet).toBe('code with ]]> in it')
    expect(result.diffComments[0].body).toBe('fix the ]]> issue')
  })

  test('handles line ranges in diff comments', () => {
    const input = '<diff-comments>\n<diff-comment file="utils.ts" lines="10-15" outdated="false">\n<snippet><![CDATA[function foo() {]]></snippet>\n<body><![CDATA[refactor this]]></body>\n</diff-comment>\n</diff-comments>\ndo it'
    const result = parseUserMessageAttachments(input)

    expect(result.diffComments[0].lines).toBe('10-15')
  })

  test('extracts diff comments alongside other attachment types', () => {
    const input = [
      '<ticket title="refactor">\nrefactor the code\n</ticket>',
      '<diff-comments>\n<diff-comment file="main.py" lines="11" outdated="false">\n<snippet><![CDATA[def foo():]]></snippet>\n<body><![CDATA[rename this]]></body>\n</diff-comment>\n</diff-comments>',
      'apply everything'
    ].join('\n')
    const result = parseUserMessageAttachments(input)

    expect(result.tickets).toHaveLength(1)
    expect(result.diffComments).toHaveLength(1)
    expect(result.cleanText.trim()).toBe('apply everything')
  })

  test('unescapes XML attributes in diff comment file path', () => {
    const input = '<diff-comments>\n<diff-comment file="src/a&amp;b.ts" lines="1" outdated="false">\n<snippet><![CDATA[code]]></snippet>\n<body><![CDATA[fix]]></body>\n</diff-comment>\n</diff-comments>\ndo'
    const result = parseUserMessageAttachments(input)

    expect(result.diffComments[0].file).toBe('src/a&b.ts')
  })
})
