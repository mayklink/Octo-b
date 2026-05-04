import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Settings,
  Palette,
  Monitor,
  Code,
  Terminal,
  Keyboard,
  Download,
  Shield,
  Eye,
  Wrench,
  Sparkles,
  Plug,
  Bug,
  ClipboardList,
  FileSearch
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { SettingsAppearance } from './SettingsAppearance'
import { SettingsGeneral } from './SettingsGeneral'
import { SettingsModels } from './SettingsModels'
import { SettingsEditor } from './SettingsEditor'
import { SettingsTerminal } from './SettingsTerminal'
import { SettingsShortcuts } from './SettingsShortcuts'
import { SettingsUpdates } from './SettingsUpdates'
import { SettingsSecurity } from './SettingsSecurity'
import { SettingsPrivacy } from './SettingsPrivacy'
import { SettingsIntegrations } from './SettingsIntegrations'
import { SettingsAdvanced } from './SettingsAdvanced'
import { SettingsPet } from './SettingsPet'
import { SettingsTaskPrompts } from './SettingsTaskPrompts'
import { SettingsCodeReviewPrompts } from './SettingsCodeReviewPrompts'
import { cn } from '@/lib/utils'

type SettingsSectionId =
  | 'appearance'
  | 'general'
  | 'models'
  | 'task-prompts'
  | 'code-review-prompts'
  | 'pet'
  | 'editor'
  | 'terminal'
  | 'integrations'
  | 'security'
  | 'privacy'
  | 'shortcuts'
  | 'advanced'
  | 'updates'

export function SettingsModal(): React.JSX.Element {
  const { t } = useTranslation()
  const { isOpen, activeSection, closeSettings, openSettings, setActiveSection } =
    useSettingsStore()

  const sections = useMemo(
    () =>
      [
        { id: 'appearance' as const, label: t('settings.nav.appearance'), icon: Palette },
        { id: 'general' as const, label: t('settings.nav.general'), icon: Monitor },
        { id: 'task-prompts' as const, label: t('settings.nav.taskPrompts'), icon: ClipboardList },
        {
          id: 'code-review-prompts' as const,
          label: t('settings.nav.codeReviewPrompts'),
          icon: FileSearch
        },
        { id: 'models' as const, label: t('settings.nav.models'), icon: Sparkles },
        { id: 'pet' as const, label: t('settings.nav.pet'), icon: Bug },
        { id: 'editor' as const, label: t('settings.nav.editor'), icon: Code },
        { id: 'terminal' as const, label: t('settings.nav.terminal'), icon: Terminal },
        { id: 'integrations' as const, label: t('settings.nav.integrations'), icon: Plug },
        { id: 'security' as const, label: t('settings.nav.security'), icon: Shield },
        { id: 'privacy' as const, label: t('settings.nav.privacy'), icon: Eye },
        { id: 'shortcuts' as const, label: t('settings.nav.shortcuts'), icon: Keyboard },
        { id: 'advanced' as const, label: t('settings.nav.advanced'), icon: Wrench },
        { id: 'updates' as const, label: t('settings.nav.updates'), icon: Download }
      ] satisfies ReadonlyArray<{ id: SettingsSectionId; label: string; icon: typeof Palette }>,
    [t]
  )

  // Listen for the custom event dispatched by keyboard shortcut handler
  useEffect(() => {
    const handleOpenSettings = (): void => {
      openSettings()
    }
    window.addEventListener('octob:open-settings', handleOpenSettings)
    return () => window.removeEventListener('octob:open-settings', handleOpenSettings)
  }, [openSettings])

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeSettings()
      }}
    >
      <DialogContent
        className="max-w-3xl h-[70vh] p-0 gap-0 overflow-hidden"
        data-testid="settings-modal"
      >
        <div className="flex h-full min-h-0">
          {/* Left navigation */}
          <nav className="w-48 border-r bg-muted/30 p-3 flex flex-col gap-1 shrink-0">
            <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <DialogTitle className="text-sm font-semibold">{t('settings.title')}</DialogTitle>
            </div>
            {sections.map((section) => {
              const Icon = section.icon
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
                    activeSection === section.id
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                  data-testid={`settings-nav-${section.id}`}
                >
                  <Icon className="h-4 w-4" />
                  {section.label}
                </button>
              )
            })}
          </nav>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeSection === 'appearance' && <SettingsAppearance />}
            {activeSection === 'general' && <SettingsGeneral />}
            {activeSection === 'task-prompts' && <SettingsTaskPrompts />}
            {activeSection === 'code-review-prompts' && <SettingsCodeReviewPrompts />}
            {activeSection === 'models' && <SettingsModels />}
            {activeSection === 'pet' && <SettingsPet />}
            {activeSection === 'editor' && <SettingsEditor />}
            {activeSection === 'terminal' && <SettingsTerminal />}
            {activeSection === 'integrations' && <SettingsIntegrations />}
            {activeSection === 'security' && <SettingsSecurity />}
            {activeSection === 'privacy' && <SettingsPrivacy />}
            {activeSection === 'shortcuts' && <SettingsShortcuts />}
            {activeSection === 'updates' && <SettingsUpdates />}
            {activeSection === 'advanced' && <SettingsAdvanced />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
