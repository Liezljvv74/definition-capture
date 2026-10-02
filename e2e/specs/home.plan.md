# Home Test Plan

## Application Overview

The landing page at / is the app's only public page; the dashboard at /home is what a signed-in learner sees first.

## Test Scenarios

### 1. Home

**Seed:** `e2e/seed.spec.ts`

#### 1.1. dashboard

**File:** `e2e/home/dashboard.spec.ts`

**Steps:**
  1. Sign in and land on the dashboard
    - expect: the URL is /home and the heading starts "Welcome back"
    - expect: the "Ready for review" card is visible
  2. Click the Vocabulary card
    - expect: the Vocabulary page opens

#### 1.2. landing-is-public

**File:** `e2e/landing/landing-is-public.spec.ts`

**Steps:**
  1. Open / without signing in
    - expect: the h1 "Your personal repository for learning any language" and a "Create an account" link
  2. Request /robots.txt, /sitemap.xml and /llms.txt
    - expect: each returns 200 without a redirect to sign-in
