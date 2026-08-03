"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type SimpleTab = {
  id: string
  label: string
  content: React.ReactNode
  count?: string | number
  disabled?: boolean
}

type SimpleTabsProps = {
  label: string
  tabs: readonly SimpleTab[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}

function SimpleTabs({
  label,
  tabs,
  value,
  defaultValue,
  onValueChange,
}: SimpleTabsProps) {
  const initialValue = defaultValue ?? tabs[0]?.id
  const controlledValue = value === undefined ? {} : { value }
  const uncontrolledValue = value === undefined ? { defaultValue: initialValue } : {}

  return (
    <Tabs
      {...controlledValue}
      {...uncontrolledValue}
      onValueChange={onValueChange}
    >
      <TabsList variant="line" aria-label={label}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} disabled={tab.disabled}>
            {tab.label}
            {tab.count !== undefined ? <Badge variant="secondary">{tab.count}</Badge> : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}

export { SimpleTabs }
export type { SimpleTab, SimpleTabsProps }
