import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FallbackToolView } from '@/components/sessions/tools/FallbackToolView'

describe('FallbackToolView', () => {
  it('serializes structured output instead of passing an object React child', () => {
    const html = renderToStaticMarkup(
      <FallbackToolView
        name="some_tool"
        input={{ foo: 1 }}
        status="success"
        output={{ content: 'nested explanation' }}
      />
    )
    expect(html).toContain('nested explanation')
    expect(html).toContain('Output:')
  })

  it('renders structured error payloads as text inside the view', () => {
    const html = renderToStaticMarkup(
      <FallbackToolView name="some_tool" input={{}} status="error" error={{ content: 'bad' }} />
    )
    expect(html).toContain('bad')
    expect(html).toContain('Error:')
  })
})
