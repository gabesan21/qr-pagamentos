"use client"

import * as React from "react"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

const supportedLocales = ["pt-BR", "en"] as const

type SupportedLocale = (typeof supportedLocales)[number]

type LocalizedFieldEntry = {
  localeLabel: string
  label: string
  value: string
  description?: string
  error?: string
}

type LocalizedFieldGroupProps = {
  id: string
  groupLabel: string
  fields: Record<SupportedLocale, LocalizedFieldEntry>
  onValueChange: (locale: SupportedLocale, value: string) => void
  multiline?: boolean
  required?: boolean
  disabled?: boolean
}

function LocalizedFieldGroup({
  id,
  groupLabel,
  fields,
  onValueChange,
  multiline = false,
  required = false,
  disabled = false,
}: LocalizedFieldGroupProps) {
  const [activeLocale, setActiveLocale] = React.useState<SupportedLocale>("pt-BR")

  return (
    <FieldGroup>
      <FieldTitle id={`${id}-label`}>{groupLabel}</FieldTitle>
      <Tabs
        value={activeLocale}
        onValueChange={(value) => setActiveLocale(value as SupportedLocale)}
      >
        <TabsList variant="line" aria-labelledby={`${id}-label`}>
          {supportedLocales.map((locale) => (
            <TabsTrigger key={locale} value={locale} disabled={disabled}>
              {fields[locale].localeLabel}
              <span className="sr-only">
                {fields[locale].error ? `, ${fields[locale].error}` : ""}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {supportedLocales.map((locale) => {
          const field = fields[locale]
          const fieldId = `${id}-${locale}`
          const descriptionId = field.description ? `${fieldId}-description` : undefined
          const errorId = field.error ? `${fieldId}-error` : undefined
          const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined
          const Control = multiline ? Textarea : Input

          return (
            <TabsContent key={locale} value={locale}>
              <Field data-invalid={Boolean(field.error)} data-disabled={disabled}>
                <FieldLabel htmlFor={fieldId}>
                  {field.label}
                  {required ? <span aria-hidden="true">*</span> : null}
                </FieldLabel>
                <Control
                  id={fieldId}
                  value={field.value}
                  required={required}
                  disabled={disabled}
                  aria-invalid={Boolean(field.error)}
                  aria-describedby={describedBy}
                  onChange={(event) => onValueChange(locale, event.currentTarget.value)}
                />
                {field.description ? (
                  <FieldDescription id={descriptionId}>{field.description}</FieldDescription>
                ) : null}
                {field.error ? <FieldError id={errorId}>{field.error}</FieldError> : null}
              </Field>
            </TabsContent>
          )
        })}
      </Tabs>
    </FieldGroup>
  )
}

export { LocalizedFieldGroup, supportedLocales }
export type {
  LocalizedFieldEntry,
  LocalizedFieldGroupProps,
  SupportedLocale,
}
