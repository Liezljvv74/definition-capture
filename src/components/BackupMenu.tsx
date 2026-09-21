"use client";

import { useRef, useState, type ChangeEvent } from "react";

import { ExportDialog } from "@/components/backup/ExportDialog";
import { ImportDialog } from "@/components/backup/ImportDialog";
import { MENU_ITEM, NavMenu } from "@/components/NavMenu";

/** Nothing open, exporting, or importing a file already chosen. */
type Task = null | { kind: "export" } | { kind: "import"; file: File };

/**
 * Export and Import, in the nav bar rather than on the list pages.
 *
 * They used to be a pair of buttons in the Terms and Phrases headers, which
 * meant Verbs never had them, and the export they offered was scoped to "this
 * page", a question the nav bar cannot ask. Backing up is about the account,
 * so it belongs beside the other account-wide controls.
 *
 * **This component subscribes to no store, and that is deliberate.**
 * Subscribing is what tells a store to fetch, and this sits in the nav on
 * every workspace page. Reading the three lists here to answer a question
 * nobody has asked yet would undo the work that stopped Settings from loading
 * lists it never shows. The dialogs are where the hooks live,
 * and they are only mounted once someone opens one.
 */
export function BackupMenu() {
  const [task, setTask] = useState<Task>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function handleFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so choosing the same file twice still fires a change.
    event.target.value = "";
    if (file) setTask({ kind: "import", file });
  }

  return (
    <>
      <NavMenu label="Backup">
        {(close) => (
          <>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className={MENU_ITEM}
                onClick={() => {
                  close();
                  setTask({ kind: "export" });
                }}
              >
                Export…
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className={MENU_ITEM}
                onClick={() => {
                  close();
                  // The dialog opens when a file comes back, not now: there
                  // is nothing to show until there is a file to describe.
                  fileInput.current?.click();
                }}
              >
                Import…
              </button>
            </li>
          </>
        )}
      </NavMenu>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFileChosen}
      />

      {task?.kind === "export" && <ExportDialog onClose={() => setTask(null)} />}
      {task?.kind === "import" && (
        <ImportDialog
          // Keyed on the file so choosing a second one starts a clean dialog
          // rather than reusing the first file's parsed contents.
          key={`${task.file.name}:${task.file.lastModified}`}
          file={task.file}
          onClose={() => setTask(null)}
        />
      )}
    </>
  );
}
