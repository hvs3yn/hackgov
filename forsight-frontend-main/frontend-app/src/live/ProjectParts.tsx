import { useState } from "react";
import type { FormEvent } from "react";
import { Field, Icon } from "../ui";
import { inputClass } from "../styles";
import { errorMessage, projects as projectsApi } from "../api";
import type { ProjectView } from "../api";
import { Notice, Overlay, OverlayHeader } from "./common";
import { btnPrimary, btnSecondary } from "./format";

/** Creates a project in the given workspace; the creator becomes its Lead. */
export function CreateProjectModal({ workspaceId, onCreated, onClose }: { workspaceId: string; onCreated: (p: ProjectView) => void; onClose: () => void }) {
  const [form, setForm] = useState({ name: "", description: "", startDate: "", deadline: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Give the project a name.");
    if (form.startDate && form.deadline && form.deadline < form.startDate) return setError("The deadline is before the start date.");
    setBusy(true);
    setError(null);
    try {
      const created = await projectsApi.create(workspaceId, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        startDate: form.startDate || null,
        deadline: form.deadline || null,
      });
      onCreated(created);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Overlay label="New project" onClose={onClose}>
      <OverlayHeader title="New project" onClose={onClose} />
      <form onSubmit={submit} className="space-y-4 p-6">
        <Field id="np-name" label="Name">
          <input id="np-name" value={form.name} disabled={busy} maxLength={200} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass(false)} />
        </Field>
        <Field id="np-desc" label="Description">
          <textarea id="np-desc" rows={2} value={form.description} disabled={busy} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass(false)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="np-start" label="Start date">
            <input id="np-start" type="date" value={form.startDate} disabled={busy} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={inputClass(false)} />
          </Field>
          <Field id="np-deadline" label="Deadline">
            <input id="np-deadline" type="date" value={form.deadline} min={form.startDate || undefined} disabled={busy} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className={inputClass(false)} />
          </Field>
        </div>
        {error && <Notice>{error}</Notice>}
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy && <Icon name="spinner" />}
            Create project
          </button>
        </div>
      </form>
    </Overlay>
  );
}
