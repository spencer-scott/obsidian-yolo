import cx from 'clsx'
import { Sparkles, X } from 'lucide-react'
import { TFile } from 'obsidian'
import type React from 'react'
import { useState } from 'react'

import { useApp } from '../../contexts/app-context'
import { useLanguage } from '../../contexts/language-context'
import {
  type StagedReference,
  cleanupStaging,
  createStagingDir,
  validateReferenceFile,
  writeReferenceToStaging,
} from '../../core/learning/generation/referenceStaging'

import { LearningFileDropzone, LearningModal } from './LearningModal'

const levelIds = ['beginner', 'familiar', 'experienced', 'advanced'] as const

export type LearningWizardInput = {
  topic: string
  level: string
  goal: string
  referenceFiles?: StagedReference[]
  stagingDir?: string
}

export function Wizard({
  learningBaseDir,
  onClose,
  onComplete,
}: {
  learningBaseDir: string
  onClose: () => void
  onComplete: (input: LearningWizardInput) => void
}) {
  const app = useApp()
  const { t } = useLanguage()
  const levels = levelIds.map((id) => ({
    value: id,
    label: t(`learning.wizard.levels.${id}`, id),
  }))
  const [topic, setTopic] = useState('')
  const [goal, setGoal] = useState('')
  const [level, setLevel] = useState<(typeof levelIds)[number]>('familiar')
  const [referenceFiles, setReferenceFiles] = useState<StagedReference[]>([])
  const [stagingDir, setStagingDir] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const closeAndCleanup = () => {
    if (stagingDir) void cleanupStaging(app, stagingDir)
    onClose()
  }

  const handleFiles = async (files: FileList | File[]) => {
    setUploadError(null)
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return

    let dir = stagingDir
    if (!dir) {
      dir = await createStagingDir(app, learningBaseDir, crypto.randomUUID())
      setStagingDir(dir)
    }

    const newRefs: StagedReference[] = []
    for (const file of fileArray) {
      const error = validateReferenceFile(file)
      if (error) {
        setUploadError(error)
        continue
      }
      const ref = await writeReferenceToStaging(
        app,
        dir,
        file.name,
        await file.arrayBuffer(),
      )
      newRefs.push(ref)
    }
    const newPaths = new Set(newRefs.map((ref) => ref.vaultPath))
    setReferenceFiles((prev) => [
      ...prev.filter((ref) => !newPaths.has(ref.vaultPath)),
      ...newRefs,
    ])
  }

  const removeReference = async (ref: StagedReference) => {
    const file = app.vault.getAbstractFileByPath(ref.vaultPath)
    if (file instanceof TFile) await app.fileManager.trashFile(file)
    setReferenceFiles((prev) =>
      prev.filter((item) => item.vaultPath !== ref.vaultPath),
    )
  }

  return (
    <LearningModal
      title={t('learning.wizard.title', 'New learning project')}
      onClose={closeAndCleanup}
      closeLabel={t('common.close', 'Close')}
      footer={
        <>
          <button
            type="button"
            onClick={closeAndCleanup}
            className="yolo-learning-wizard-cancel"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={() =>
              onComplete({
                topic,
                level,
                goal,
                referenceFiles,
                stagingDir: stagingDir ?? undefined,
              })
            }
            className="yolo-learning-wizard-primary"
          >
            <Sparkles size={16} />
            {t('learning.wizard.createOutline', 'Create and generate outline')}
          </button>
        </>
      }
    >
      <StepOne
        topic={topic}
        setTopic={setTopic}
        goal={goal}
        setGoal={setGoal}
        level={level}
        setLevel={setLevel}
        levels={levels}
        referenceFiles={referenceFiles}
        uploadError={uploadError}
        handleFiles={handleFiles}
        removeReference={removeReference}
        t={t}
      />
    </LearningModal>
  )
}

function StepOne({
  topic,
  setTopic,
  goal,
  setGoal,
  level,
  setLevel,
  levels,
  referenceFiles,
  uploadError,
  handleFiles,
  removeReference,
  t,
}: {
  topic: string
  setTopic: (value: string) => void
  goal: string
  setGoal: (value: string) => void
  level: (typeof levelIds)[number]
  setLevel: (value: (typeof levelIds)[number]) => void
  levels: { value: (typeof levelIds)[number]; label: string }[]
  referenceFiles: StagedReference[]
  uploadError: string | null
  handleFiles: (files: FileList | File[]) => Promise<void>
  removeReference: (ref: StagedReference) => Promise<void>
  t: (keyPath: string, fallback?: string) => string
}) {
  return (
    <div className="yolo-learning-wizard-step">
      <div className="yolo-learning-wizard-intro">
        <div className="yolo-learning-wizard-intro-icon">
          <Sparkles size={22} />
        </div>
        <div>
          <h2 className="yolo-learning-wizard-heading">
            {t('learning.wizard.heading', 'Tell YOLO what you want to learn')}
          </h2>
          <p className="yolo-learning-wizard-description">
            {t(
              'learning.wizard.description',
              'Fill in the details below and YOLO will generate a structured learning outline.',
            )}
          </p>
        </div>
      </div>

      <Field
        label={t('learning.wizard.topicLabel', 'Learning topic')}
        hint={t(
          'learning.wizard.topicHint',
          'For example: Learn React, criminal law basics, understand a paper',
        )}
      >
        <input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder={t('learning.wizard.topicPlaceholder', 'Learn React')}
          className="yolo-learning-wizard-input"
        />
      </Field>

      <Field label={t('learning.wizard.modeLabel', 'Learning mode')}>
        <div className="yolo-learning-wizard-mode-grid">
          <div
            className={cx(
              'yolo-learning-wizard-mode-card',
              'yolo-learning-wizard-mode-card-selected',
            )}
          >
            <div className="yolo-learning-wizard-mode-title">
              {t('learning.wizard.modes.standard.title', 'Standard mode')}
            </div>
            <div className="yolo-learning-wizard-mode-description">
              {t(
                'learning.wizard.modes.standard.desc',
                'Generate a structured knowledge system with points, cards, and exercises',
              )}
            </div>
          </div>
          <div
            className="yolo-learning-wizard-mode-card yolo-learning-wizard-mode-card-disabled"
            aria-disabled
          >
            <div className="yolo-learning-wizard-mode-title">
              {t('learning.wizard.modes.project.title', 'Project mode')}
            </div>
            <div className="yolo-learning-wizard-mode-description">
              {t(
                'learning.wizard.modes.project.desc',
                'Learn through hands-on projects, with AI guiding each deliverable step',
              )}
            </div>
            <span className="yolo-learning-wizard-mode-badge">
              {t('learning.wizard.modes.comingSoon', 'Coming soon')}
            </span>
          </div>
        </div>
      </Field>

      <Field label={t('learning.wizard.levelLabel', 'Current level')}>
        <ChipGroup options={levels} value={level} onChange={setLevel} />
      </Field>

      <Field
        label={t('learning.wizard.goalLabel', 'Learning goal and notes')}
        hint={t(
          'learning.wizard.goalHint',
          'What level do you want to reach? You can also add timing, use cases, or topics to avoid.',
        )}
      >
        <textarea
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          rows={3}
          placeholder={t(
            'learning.wizard.goalPlaceholder',
            'Build medium-complexity React apps independently; finish in two weeks, focus on practice, less pure theory',
          )}
          className="yolo-learning-wizard-textarea"
        />
      </Field>

      <Field
        label={t('learning.wizard.referencesLabel', 'Reference materials')}
        optional
        hint={t(
          'learning.wizard.referencesHint',
          'YOLO will customize the outline based on uploaded files',
        )}
        optionalLabel={t('learning.wizard.optional', '(Optional)')}
      >
        <LearningFileDropzone
          accept=".pdf,.docx,.doc,.md,.markdown,.txt"
          multiple
          title={t(
            'learning.wizard.uploadTitle',
            'Drop files here or click to upload',
          )}
          hint={t(
            'learning.wizard.uploadHint',
            'Supports PDF, Word, and Markdown. Max 20 MB per file.',
          )}
          onFiles={handleFiles}
        />
        {uploadError && (
          <div className="yolo-learning-wizard-upload-error">{uploadError}</div>
        )}
        {referenceFiles.length > 0 && (
          <div className="yolo-learning-wizard-upload-list">
            {referenceFiles.map((ref) => (
              <div
                key={ref.vaultPath}
                className="yolo-learning-wizard-upload-item"
              >
                <span className="yolo-learning-wizard-upload-item-name">
                  {ref.name}
                </span>
                <button
                  type="button"
                  onClick={() => void removeReference(ref)}
                  className="yolo-learning-wizard-upload-item-remove"
                  aria-label={t('common.remove', 'Remove')}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Field>
    </div>
  )
}

function Field({
  label,
  required,
  optional,
  optionalLabel = '(Optional)',
  hint,
  children,
}: {
  label: string
  required?: boolean
  optional?: boolean
  optionalLabel?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="yolo-learning-wizard-field">
      <div className="yolo-learning-wizard-field-header">
        <label className="yolo-learning-wizard-label">
          {label}
          {required && <span className="yolo-learning-wizard-required">*</span>}
          {optional && (
            <span className="yolo-learning-wizard-optional">
              {optionalLabel}
            </span>
          )}
        </label>
        {hint && <span className="yolo-learning-wizard-hint">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: { value: (typeof levelIds)[number]; label: string }[]
  value: (typeof levelIds)[number]
  onChange: (value: (typeof levelIds)[number]) => void
}) {
  return (
    <div className="yolo-learning-wizard-chip-group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            'yolo-learning-wizard-chip',
            value === option.value && 'yolo-learning-wizard-chip-selected',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
