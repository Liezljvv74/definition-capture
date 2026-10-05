# Conversations Test Plan

## Application Overview

The chat at /conversations, behind sign-in, kept to the grammar of the
studied language. Each message goes to the model with the saved turns before
it, and every answered exchange is saved, so a reload shows the conversation
again. New conversation deletes it.

## Test Scenarios

Precondition: the local test account is marked paid in the local database
(`account_plans`, `plan = 'paid'`, inserted as `postgres`), since each run
spends four messages of the allowance the tutor shares and a free account has
five in all. These tests send real messages: a run costs about two cents.

Each test sets the studied language to German first and back to "Not chosen"
after, and starts and ends with New conversation, so neither sees the other's
messages and a failed run leaves nothing behind.

### 1. Conversations

**Seed:** `e2e/seed.spec.ts`

#### 1.1. remembers-the-earlier-message

**File:** `e2e/conversations/remembers-the-earlier-message.spec.ts`

**Steps:**
  1. Open /conversations and start a new conversation
  2. Send "In one short sentence, what is the German dative case for?"
    - expect: a reply appears
  3. Send "Say that again more simply."
    - expect: a second reply appears
    - expect: it is about the dative (the dative, the indirect object, "to whom", "dem", giving or receiving), which the follow-up alone never names
    - expect: it differs from the first reply

#### 1.2. survives-a-reload

**File:** `e2e/conversations/survives-a-reload.spec.ts`

**Steps:**
  1. Open /conversations and start a new conversation
  2. Send two grammar questions, each waiting for its reply
  3. Reload the page
    - expect: both messages are shown
    - expect: four turns are shown: the two messages and their two replies
