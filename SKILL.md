---
name: design-system-1flex
description: Creates implementation-ready design-system guidance with tokens, component behavior, and accessibility standards. Use when creating or updating UI rules, component specifications, or design-system documentation.
---

<!-- TYPEUI_SH_MANAGED_START -->

# 1Flex

## Mission
Deliver implementation-ready design-system guidance for 1Flex that can be applied consistently across content site interfaces.

## Brand
- Product/brand: 1Flex
- URL: https://www.1flex.org/
- Audience: readers and knowledge seekers
- Product surface: content site

## Style Foundations
- Visual style: structured, accessible, implementation-first
- Main font style: `font.family.primary=CustomFont`, `font.family.stack=CustomFont, system-ui, -apple-system, sans-serif`, `font.size.base=24px`, `font.weight.base=700`, `font.lineHeight.base=32px`
- Typography scale: `font.size.xs=12px`, `font.size.sm=14px`, `font.size.md=15.05px`, `font.size.lg=16px`, `font.size.xl=17.28px`, `font.size.2xl=24px`
- Color palette: `color.text.primary=oklch(0.98 0 0)`, `color.text.secondary=oklab(0.999994 0.0000455677 0.0000200868 / 0.7)`, `color.text.tertiary=#ffffff`, `color.text.inverse=oklab(0.999994 0.0000455678 0.0000200868 / 0.4)`, `color.surface.base=#000000`, `color.surface.muted=oklch(0.12 0 0)`, `color.surface.raised=oklab(0.55 0.199388 0.092976 / 0.1)`, `color.surface.strong=#2a2a2a`, `color.border.default=oklch(0.25 0 0)`, `color.focus.ring=oklab(0.55 0.199388 0.092976 / 0.5)`
- Spacing scale: `space.1=4px`, `space.2=8px`, `space.3=10px`, `space.4=11.2px`, `space.5=12px`, `space.6=16px`, `space.7=20px`, `space.8=24px`
- Radius/shadow/motion tokens: `radius.xs=2px`, `radius.sm=4px`, `radius.md=50px`, `radius.lg=16777200px` | `motion.duration.instant=150ms`, `motion.duration.fast=200ms`, `motion.duration.normal=300ms`

## Accessibility
- Target: WCAG 2.2 AA
- Keyboard-first interactions required.
- Focus-visible rules required.
- Contrast constraints required.

## Writing Tone
concise, confident, implementation-focused

## Rules: Do
- Use semantic tokens, not raw hex values in component guidance.
- Every component must define required states: default, hover, focus-visible, active, disabled, loading, error.
- Responsive behavior and edge-case handling should be specified for every component family.
- Accessibility acceptance criteria must be testable in implementation.

## Rules: Don't
- Do not allow low-contrast text or hidden focus indicators.
- Do not introduce one-off spacing or typography exceptions.
- Do not use ambiguous labels or non-descriptive actions.

## Guideline Authoring Workflow
1. Restate design intent in one sentence.
2. Define foundations and tokens.
3. Define component anatomy, variants, and interactions.
4. Add accessibility acceptance criteria.
5. Add anti-patterns and migration notes.
6. End with QA checklist.

## Required Output Structure
- Context and goals
- Design tokens and foundations
- Component-level rules (anatomy, variants, states, responsive behavior)
- Accessibility requirements and testable acceptance criteria
- Content and tone standards with examples
- Anti-patterns and prohibited implementations
- QA checklist

## Component Rule Expectations
- Include keyboard, pointer, and touch behavior.
- Include spacing and typography token requirements.
- Include long-content, overflow, and empty-state handling.

## Quality Gates
- Every non-negotiable rule must use "must".
- Every recommendation should use "should".
- Every accessibility rule must be testable in implementation.
- Prefer system consistency over local visual exceptions.

<!-- TYPEUI_SH_MANAGED_END -->
