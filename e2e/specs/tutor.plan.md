# Tutor Test Plan

## Application Overview

The grammar tutor at /tutor, behind sign-in. It asks for a studied language, then offers a question box with the account's remaining allowance. No question is submitted: an answer costs money.

## Test Scenarios

Precondition: a fresh local test account, with no `tutor_usage` rows and no paid plan, so the allowance reads "5 trial messages left".

### 1. Tutor

**Seed:** `e2e/seed.spec.ts`

#### 1.1. tutor-states

**File:** `e2e/tutor/tutor-states.spec.ts`

**Steps:**
  1. Clear the studied language in Settings, then open /tutor
    - expect: the link "Choose the language you are studying" is visible
    - expect: there is no question box
  2. Choose German under "Language you are learning" in Settings, then open /tutor
    - expect: the question box is visible
    - expect: "5 trial messages left" is visible
  3. After the test, the language is set back to "Not chosen"
