# Vocabulary Test Plan

## Application Overview

Vocabulary is the glossary: a table of words, each with an optional
definition, private to the signed-in account and stored in Supabase. Adding,
finding and deleting a word is the core loop of the app, and every write is
optimistic, so the screen can show a change the database never accepted. These
scenarios check what the screen shows and then reload, which proves the
database kept it.

## Test Scenarios

### 1. Vocabulary

**Seed:** `e2e/seed.spec.ts`

#### 1.1. add-search-and-delete-a-word

**File:** `e2e/vocabulary/add-search-and-delete-a-word.spec.ts`

**Steps:**
  1. Go to Vocabulary
    - expect: the "Vocabulary" heading is visible
  2. Click "Add word", type a unique word and a definition, click "Save word"
    - expect: the "Add a word" dialog closes
    - expect: a row for the word shows its definition
  3. Reload the page and type the word into the search box
    - expect: the row is still there, so the word was saved
    - expect: the count reads "1 of N words shown"
  4. Click the word's Delete button, then "Delete word" in the dialog
    - expect: the row is gone and "No words match those filters" shows
  5. Reload the page
    - expect: searching for the word shows "No words match those filters", so
      the delete was saved
