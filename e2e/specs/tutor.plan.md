# Tutor Test Plan

## Application Overview

The grammar tutor at /tutor, behind sign-in. It asks for a studied language, then offers a question box with the account's remaining allowance. No question is submitted: an answer costs money.

## Test Scenarios

Precondition: a local test account with messages left: a fresh free one reads "5 trial messages left", and a paid one reads "N left today".

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
    - expect: the allowance left is visible, "N trial messages left" or "N left today"
  3. After the test, the language is set back to "Not chosen"

#### 1.2. Tutor conversations

**File:** `e2e/tutor/conversations.spec.ts`

**Seed:** `e2e/tutor/seed.ts` writes the conversations straight into the local database; no question is sent.

**Steps:**
  1. Open /tutor?c=<id> for a seeded conversation with two answers
    - expect: its link in the Conversations sidebar is the current page
    - expect: the first answer's title and its source link are visible
  2. Tick "Include in a rule" on one answer, then on both, then press Clear
    - expect: no "Make one rule" button after one tick
    - expect: "Make one rule from 2 answers" after two
    - expect: the button is gone after Clear
  3. Search conversations for a word that appears only in an answer
    - expect: the conversation is listed
  4. Rename it from its menu, press Enter, reload
    - expect: the sidebar shows the new name
  5. Delete it from its menu and confirm
    - expect: the address is /tutor and the link is gone

#### 1.3. A conversation that is not there

**File:** `e2e/tutor/conversations.spec.ts`

**Steps:**
  1. Open /tutor?c= with an id that does not exist
    - expect: "That conversation was not found." is visible
    - expect: the question box is visible

#### 1.4. Save and link

**File:** `e2e/tutor/save-and-link.spec.ts`

**Seed:** `e2e/tutor/seed.ts`, two conversations (A with two answers, B with one)

**Steps:**
  1. In A, save the first answer as a rule
    - expect: "Saved."
  2. Reload A and save the second answer as a rule
    - expect: it is linked to the first rule automatically
  3. In B, save its answer as a rule and use "Link another rule" to find the first rule of A by its text
    - expect: the rule's checkbox is ticked and the save reports the link
