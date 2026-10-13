import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { runtimeService } from '../../services/metadata.service';
import { useMetadataStore } from '../../store/metadataStore';
import FormRenderer from './FormRenderer';
import WizardStepper from './WizardStepper';
import Spinner from '../ui/Spinner';
import Alert from '../ui/Alert';
import { getStepValidation, evaluateStepRules } from '../../utils/wizardValidation';
import { ChevronLeft, AlertTriangle, ShieldAlert, Sparkles, PartyPopper } from 'lucide-react';

/** Same normaliser as RecordFormPage — converts raw field_layouts to FormRenderer shape */
function normaliseFormMeta(rawForm) {
  if (!rawForm) return null;
  const gridColumns = rawForm.columns || 2;
  const unitWidth   = 12 / gridColumns;
  const fields = (rawForm.field_layouts || [])
    .sort((a, b) => a.order_index - b.order_index)
    .map(fl => {
      return {
        ...fl.field,
        field_name: fl.field.name,
        col_span:   Math.round(fl.col_span * unitWidth),
        position:   fl.order_index,
        row:        fl.row,
        col:        fl.col,
      };
    });
  return { ...rawForm, fields, dependencies: rawForm.dependencies || [] };
}

/** Warm, progress-aware encouragement so long forms feel light. */
function encouragement(currentStep, totalSteps) {
  if (totalSteps <= 1) return "Let's get this done.";
  if (currentStep === 0) return "Let's begin — this will only take a few minutes.";
  if (currentStep === totalSteps - 1) return 'Final step — review and submit. You made it!';
  const remaining = totalSteps - currentStep - 1;
  if (currentStep >= totalSteps / 2) return `Great progress — just ${remaining} step${remaining === 1 ? '' : 's'} to go.`;
  return "Nicely done — keep the momentum going.";
}

/**
 * StepForm — loads and renders the form for a single wizard step.
 * Separated so TanStack Query can cache each form independently.
 */
function StepForm({ step, currentStepIdx, totalSteps: _totalSteps, stepData, defaultValues, submitting, submitError, onSubmit, onBack, onCancel, submitLabel, validationErrors, onValidationErrors }) {
  // Try MetadataStore first for instant form loading
  const cachedForm = useMetadataStore((s) => step.form_id ? s.getForm(step.form_id) : null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['runtime-form', step.form_id],
    queryFn:  () => runtimeService.getForm(step.form_id),
    enabled:  !!step.form_id && !cachedForm,
  });

  const normalisedForm = useMemo(() => normaliseFormMeta(data?.data), [data]);
  const formMeta = cachedForm ?? normalisedForm;

  // Track when user attempted to submit (for showing validation summary)
  const handleInvalid = useCallback((errors) => {
    const errorList = Object.entries(errors).map(([field, err]) => ({
      field,
      message: err?.message || `${field} is invalid`,
    }));
    if (onValidationErrors) onValidationErrors(errorList);
  }, [onValidationErrors]);

  if (isLoading) return <div className="flex justify-center p-8"><Spinner size="lg" /></div>;
  if (error || !formMeta) return <Alert variant="error">Failed to load form for this step.</Alert>;

  return (
    <>
      {submitError && (
        <Alert variant="error" className="mb-4">
          {submitError.message}
          {submitError.details.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-xs space-y-0.5">
              {submitError.details.map((d) => <li key={d.field}>{d.message}</li>)}
            </ul>
          )}
        </Alert>
      )}

      {/* Validation error summary - shown when user tries to proceed with invalid fields */}
      {validationErrors && validationErrors.length > 0 && (
        <div className="mb-5 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl animate-shake">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">
                Please fix the following before continuing
              </h4>
              <ul className="space-y-1">
                {validationErrors.map((err, i) => (
                  <li key={i} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>{err.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <FormRenderer
        formMeta={formMeta}
        defaultValues={{
          // If defaultValues has numeric keys, use step-indexed; otherwise treat as flat (field names)
          ...(defaultValues[currentStepIdx] || {}),
          // Flat defaults: spread all fields — FormRenderer only uses fields in the form
          ...(typeof Object.keys(defaultValues)[0] === 'string' && isNaN(Number(Object.keys(defaultValues)[0])) ? defaultValues : {}),
          // Previously entered step data wins over defaults
          ...(stepData[currentStepIdx] || {}),
        }}
        onSubmit={onSubmit}
        onInvalid={handleInvalid}
        onCancel={currentStepIdx > 0 ? onBack : onCancel}
        loading={submitting}
        submitLabel={submitLabel}
      />
    </>
  );
}

/**
 * WizardRenderer — renders a multi-step wizard from metadata.
 *
 * Props:
 *   wizardId      — UiWizard id to load
 *   onComplete    — async (allStepData) => void  called when all steps submitted
 *   onCancel      — optional cancel callback
 *   defaultValues — { [stepIndex]: { fieldName: value } } or flat { fieldName: value }
 *                    Flat objects are distributed to every step (FormRenderer picks relevant fields).
 */
export default function WizardRenderer({ wizardId, onComplete, onCancel, defaultValues = {} }) {
  // Support flat defaultValues (e.g. from existing record EAV data)
  // by detecting non-numeric keys and treating the whole object as step-global
  const isFlatDefaults = defaultValues && typeof defaultValues === 'object'
    && Object.keys(defaultValues).length > 0
    && Object.keys(defaultValues).some(k => isNaN(Number(k)));
  const [currentStep, setCurrentStep] = useState(0);
  const [stepData, setStepData]       = useState({});
  const [completed, setCompleted]     = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting]   = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [validatedSteps, setValidatedSteps]     = useState({});

  // Try MetadataStore first for instant wizard loading
  const cachedWizard = useMetadataStore((s) => wizardId ? s.getWizard(Number(wizardId)) : null);

  const { data: wizardData, isLoading, error } = useQuery({
    queryKey: ['wizard', wizardId],
    queryFn:  () => runtimeService.getWizard(wizardId),
    enabled:  !!wizardId && !cachedWizard,
  });

  const wizard = cachedWizard ?? wizardData?.data;
  const steps      = useMemo(() => (wizard?.steps || []).sort((a, b) => a.order_index - b.order_index), [wizard]);
  const totalSteps = steps.length;
  const activeStep = steps[currentStep];

  const handleStepSubmit = useCallback(async (data) => {
    // ── Metadata-driven step validation (cross-field rules, ranges, patterns) ──
    const mergedAll = { ...Object.values(stepData).reduce((acc, d) => ({ ...acc, ...d }), {}), ...data };
    const validation = getStepValidation(activeStep);
    const ruleErrors = evaluateStepRules(validation, mergedAll);
    if (validation.block_on_invalid && ruleErrors.length) {
      setValidationErrors(prev => ({ ...prev, [currentStep]: ruleErrors }));
      return; // block advancing until rules pass
    }

    setValidationErrors(prev => ({ ...prev, [currentStep]: [] }));
    setValidatedSteps(prev => ({ ...prev, [currentStep]: true }));

    const updatedData = { ...stepData, [currentStep]: data };
    setStepData(updatedData);

    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      setSubmitting(true);
      setSubmitError(null);
      try {
        if (onComplete) await onComplete(updatedData);
        setCompleted(true);
      } catch (err) {
        // Surface the server's validation message and per-field details — the
        // raw axios message ("Request failed with status code 400") says nothing.
        const apiErr = err.response?.data?.error;
        setSubmitError({
          message: apiErr?.message || err.response?.data?.message || err.message || 'Submission failed.',
          details: Array.isArray(apiErr?.details) ? apiErr.details : [],
        });
      } finally {
        setSubmitting(false);
      }
    }
  }, [currentStep, totalSteps, stepData, onComplete, activeStep]);

  const handleStepValidationErrors = useCallback((errors) => {
    setValidationErrors(prev => ({ ...prev, [currentStep]: errors }));
  }, [currentStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  }, [currentStep]);

  // Jump to a previously completed step via the stepper rail
  const handleStepClick = useCallback((idx) => {
    if (idx <= currentStep || validatedSteps[idx]) setCurrentStep(idx);
  }, [currentStep, validatedSteps]);

  // ── Early returns AFTER all hooks ──
  if (isLoading && !cachedWizard) return <div className="flex items-center justify-center p-12"><Spinner size="xl" /></div>;
  if (error || !wizard) return <Alert variant="error">Failed to load wizard.</Alert>;
  if (!activeStep) return <Alert variant="error">No steps configured for this wizard.</Alert>;

  if (completed) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <div className="glass rounded-3xl p-10 text-center animate-slide-up">
          <div className="relative mx-auto mb-6 w-20 h-20">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 opacity-20 blur-xl animate-float" />
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-primary">
              <PartyPopper className="w-9 h-9 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{wizard.label} complete!</h2>
          <p className="text-gray-500 dark:text-white/50">
            {wizard.success_message || 'Your submission was successful. Nicely done!'}
          </p>
        </div>
      </div>
    );
  }

  const progressPct = Math.round(((currentStep + 1) / totalSteps) * 100);
  const errorSteps = Object.fromEntries(
    Object.entries(validationErrors).map(([k, v]) => [k, Array.isArray(v) && v.length > 0])
  );

  return (
    <div className="w-full max-w-[1700px] mx-auto py-8 px-5 sm:px-8 lg:px-12">
      {/* Header */}
      <div className="mb-8 flex items-start gap-3.5">
        <div className="hidden sm:flex w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 items-center justify-center shadow-primary">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900 dark:text-white truncate">
            {wizard.label}
          </h1>
          <p className="text-sm text-primary-600/90 dark:text-primary-300/80 mt-0.5">
            {encouragement(currentStep, totalSteps)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
        {/* Stepper — vertical rail (desktop) / segmented bar (mobile) */}
        <div className="lg:sticky lg:top-6">
          <WizardStepper
            steps={steps}
            currentStep={currentStep}
            validatedSteps={validatedSteps}
            errorSteps={errorSteps}
            onStepClick={handleStepClick}
          />
        </div>

        {/* Step content */}
        <div className="min-w-0">
          {/* Slim gradient progress line above the card */}
          <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full mb-4 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary-500 via-accent-500 to-primary-500 transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* key on currentStep re-mounts → replays the slide-up entrance per step */}
          <div key={currentStep} className="card p-7 sm:p-9 lg:p-10 animate-slide-up">
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-primary-500/70 dark:text-primary-300/60">
                Step {currentStep + 1} of {totalSteps}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-1.5">{activeStep.label}</h2>
            {activeStep.description && (
              <p className="text-sm sm:text-base text-gray-500 dark:text-white/50 mb-6 max-w-2xl">{activeStep.description}</p>
            )}
            {!activeStep.description && <div className="mb-6" />}

            <StepForm
              step={activeStep}
              currentStepIdx={currentStep}
              totalSteps={totalSteps}
              stepData={stepData}
              defaultValues={isFlatDefaults ? defaultValues : defaultValues}
              submitting={submitting}
              submitError={submitError}
              onSubmit={handleStepSubmit}
              onBack={handleBack}
              onCancel={onCancel}
              submitLabel={currentStep < totalSteps - 1 ? 'Continue →' : (wizard.submit_label || 'Submit')}
              validationErrors={validationErrors[currentStep] || []}
              onValidationErrors={handleStepValidationErrors}
            />
          </div>

          {currentStep > 0 && (
            <div className="flex items-center justify-start mt-4 px-1">
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 dark:text-white/50 dark:hover:text-primary-300 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Back to previous step
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
