Source: https://supabase.com/docs/guides/ai/vector-columns

# Supabase: Vector columns (saved reference)

Retrieved 8 October 2026. Below the first line is the page as the source served it
in Markdown, unedited, so check the source for changes.

Why it is here: it is how the app stores and searches embeddings in Postgres.
`tutor_exchanges.embedding` is a pgvector column, and `search_tutor` (in
`supabase/migrations/20261007122134_tutor_conversations.sql`) ranks saved
answers by cosine distance, the `<=>` operator in the table below, keeping only
those under a 0.5 cut-off, the same pattern as the page's `match_documents` and
its `match_threshold`. Two differences, both in CLAUDE.md, Embeddings: the
column is `halfvec(1024)`, pgvector's half-precision type, rather than `vector`
(this page does not cover `halfvec`; Supabase's Vector indexes page, listed
under References, gives its limits), and the vectors live on each saved answer
rather than in a separate `documents` table.

---

# Vector columns

Learn how to use vectors within your own Postgres tables

Supabase offers a number of different ways to store and query vectors within Postgres. The SQL included in this guide is applicable for clients in all programming languages. If you are a Python user, see your [Python client options](https://supabase.com/docs/guides/ai/python-clients) after reading the `Learn` section.

Vectors in Supabase are enabled via [pgvector](https://github.com/pgvector/pgvector/), a Postgres extension for storing and querying vectors in Postgres. It can be used to store [embeddings](https://supabase.com/docs/guides/ai/concepts#what-are-embeddings).

## Usage

### Enable the extension

**Dashboard**

1. Go to the [Database](https://supabase.com/dashboard/project/_/database/tables) page in the Dashboard.
2. Click on **Extensions** in the sidebar.
3. Search for "vector" and enable the extension.

**SQL**

```sql
 -- Example: enable the "vector" extension.
create extension vector
with
  schema extensions;

-- Example: disable the "vector" extension
drop
  extension if exists vector;
```

Even though the SQL code is `create extension`, this is the equivalent of "enabling the extension".
To disable an extension, call `drop extension`.

### Create a table to store vectors

After enabling the `vector` extension, you will get access to a new data type called `vector`. The size of the vector (indicated in parentheses) represents the number of dimensions stored in that vector.

```sql
create table documents (
  id serial primary key,
  title text not null,
  body text not null,
  embedding extensions.vector(384)
);
```

In the SQL snippet above, we create a `documents` table with an `embedding` column. This is a standard Postgres column, so you can name it anything you like. The `embedding` column uses the `vector` data type with 384 dimensions. Change this number to match the dimensions your embedding model produces. For example, if you're [generating embeddings](https://supabase.com/docs/guides/ai/quickstarts/generate-text-embeddings) using the open source [`gte-small`](https://huggingface.co/Supabase/gte-small) model, set this to 384.

Note: In general, embeddings with fewer dimensions perform best. See our [analysis on fewer dimensions in pgvector](https://supabase.com/blog/fewer-dimensions-are-better-pgvector).

### Storing a vector / embedding

In this example we'll generate a vector using Transformers.js, then store it in the database using the Supabase JavaScript client.

```js
import { pipeline } from '@huggingface/transformers'

const generateEmbedding = await pipeline('feature-extraction', 'Supabase/gte-small')

const title = 'First post!'
const body = 'Hello world!'

// Generate a vector using Transformers.js
const output = await generateEmbedding(body, {
  pooling: 'mean',
  normalize: true,
})

// Extract the embedding output
const embedding = Array.from(output.data)

// Store the vector in Postgres
const { data, error } = await supabase.from('documents').insert({
  title,
  body,
  embedding,
})
```

This example uses the JavaScript Supabase client, but you can modify it to work with any [supported language library](https://supabase.com/docs#client-libraries).

### Querying a vector / embedding

Similarity search is the most common use case for vectors. `pgvector` supports 3 new operators for computing distance:

| Operator | Description            |
| -------- | ---------------------- |
| `<->`    | Euclidean distance     |
| `<#>`    | negative inner product |
| `<=>`    | cosine distance        |

Choosing the right operator depends on your needs. Dot product tends to be the fastest if your vectors are normalized. For more information on how embeddings work and how they relate to each other, see [What are Embeddings?](https://supabase.com/docs/guides/ai/concepts#what-are-embeddings).

Supabase client libraries like `supabase-js` connect to your Postgres instance via [PostgREST](https://supabase.com/docs/guides/getting-started/architecture#postgrest-api). PostgREST does not currently support `pgvector` similarity operators, so we'll need to wrap our query in a Postgres function and call it via the `rpc()` method:

```sql
create or replace function match_documents (
  query_embedding extensions.vector(384),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  title text,
  body text,
  similarity float
)
language sql stable
as $$
  select
    documents.id,
    documents.title,
    documents.body,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by (documents.embedding <=> query_embedding) asc
  limit match_count;
$$;
```

This function takes a `query_embedding` argument and compares it to all other embeddings in the `documents` table. Each comparison returns a similarity score. If the similarity is greater than the `match_threshold` argument, it is returned. The number of rows returned is limited by the `match_count` argument.

Feel free to modify this method to fit the needs of your application. The `match_threshold` ensures that only documents that have a minimum similarity to the `query_embedding` are returned. Without this, you may end up returning documents that subjectively don't match. This value will vary for each application - you will need to perform your own testing to determine the threshold that makes sense for your app.

If you index your vector column, ensure that the `order by` sorts by the distance function directly (rather than sorting by the calculated `similarity` column, which may lead to the index being ignored and poor performance).

To execute the function from your client library, call `rpc()` with the name of your Postgres function:

```ts
const { data: documents } = await supabaseClient.rpc('match_documents', {
  query_embedding: embedding, // Pass the embedding you want to compare
  match_threshold: 0.78, // Choose an appropriate threshold for your data
  match_count: 10, // Choose the number of matches
})
```

In this example `embedding` would be another embedding you wish to compare against your table of pre-generated embedding documents. For example if you were building a search engine, every time the user submits their query you would first generate an embedding on the search query itself, then pass it into the above `rpc()` function to match.

Note: To filter your vector search by another column from the JS client, extend the function above with an extra parameter and `where` clause. See [Filtering vector search by metadata](https://supabase.com/docs/guides/ai/semantic-search#filtering-vector-search-by-metadata) for a worked example.

Note: Be sure to use embeddings produced from the same embedding model when calculating distance. Comparing embeddings from two different models will produce no meaningful result.

Vectors and embeddings can be used for much more than search. Learn more about embeddings at [What are Embeddings?](https://supabase.com/docs/guides/ai/concepts#what-are-embeddings).

### Indexes

Once your vector table starts to grow, you will likely want to add an index to speed up queries. See [Vector indexes](https://supabase.com/docs/guides/ai/vector-indexes) to learn how vector indexes work and how to create them.

---

## References

- [This page (source)](https://supabase.com/docs/guides/ai/vector-columns)
- [Vector indexes, with the `halfvec` dimension limits](https://supabase.com/docs/guides/ai/vector-indexes)
- [HNSW indexes, with `halfvec` examples](https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes)
- [pgvector extension](https://supabase.com/docs/guides/database/extensions/pgvector)
- [Supabase AI & Vectors](https://supabase.com/docs/guides/ai)
- [Where the app's vector column and search are defined](../../supabase/migrations/20261007122134_tutor_conversations.sql)
