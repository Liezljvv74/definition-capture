-- A table holds several tenses side by side, a column each, rather than one.
--
-- `tense text` becomes `tenses text[]`, and every row carries a conjugation
-- per tense instead of a single one: `conjugations[i]` belongs to
-- `tenses[i]`. Parallel arrays rather than a map keyed by tense name, because
-- the reader inserts columns to the left and to the right — order is the
-- point, and a map has none.
--
-- Existing tables are converted, not dropped. A table whose tense was never
-- asked for keeps its one column with an empty heading, exactly as it looks
-- today: nothing here invents a tense on its behalf, which is also why
-- `tenses` has no no-blank constraint.

alter table public.verb_tables
  add column tenses text[] not null default '{}';

-- One column, named whatever the table already said.
update public.verb_tables set tenses = array[tense];

-- {person, conjugation, notes} → {person, conjugations: [conjugation], notes}
update public.verb_tables
set rows = (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'person', row_value ->> 'person',
        'conjugations', jsonb_build_array(coalesce(row_value ->> 'conjugation', '')),
        'notes', coalesce(row_value ->> 'notes', '')
      )
      order by ordinality
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(rows) with ordinality as element(row_value, ordinality)
);

alter table public.verb_tables drop column tense;

-- Past a dozen columns the table stops being readable on any screen.
alter table public.verb_tables
  add constraint verb_tables_tenses_sane
    check (coalesce(array_length(tenses, 1), 0) <= 12);

comment on column public.verb_tables.tenses is
  'One per column, in display order. `rows[].conjugations` lines up with it.';
