import Link from "next/link";

/**
 * A rule's topic, chosen from the list in Settings. It used to be a free text
 * field with suggestions, which let a mistyped name quietly become a new
 * topic; topics are made in Settings, and a rule only picks one.
 */
export function TopicSelect({
  id,
  topics,
  value,
  onChange,
}: {
  id: string;
  topics: readonly string[];
  value: string;
  onChange: (topic: string) => void;
}) {
  if (topics.length === 0) {
    return (
      <p id={id} className="text-sm text-slate-600 dark:text-slate-300">
        There are no topics yet.{" "}
        <Link href="/settings?section=grammar" className="text-indigo-700 underline dark:text-indigo-300">
          Add one in Settings
        </Link>
        .
      </p>
    );
  }
  // A rule keeps the topic it has even if the list is somehow missing it,
  // rather than showing blank and looking as if the topic were lost.
  const options = value && !topics.includes(value) ? [value, ...topics] : topics;
  return (
    <select id={id} className="field" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="" disabled>
        Choose a topic
      </option>
      {options.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}
