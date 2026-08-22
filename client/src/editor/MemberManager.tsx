import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ProjectMemberView } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { useConfirmDialog } from "./ConfirmDialog";
import type { ProjectRole } from "../../../shared/src/users";

interface Props {
  onClose?: () => void;
}

const ROLES: ProjectRole[] = ["viewer", "translator", "letterer", "admin"];

/** Project-admin screen: who may open/edit this specific project, and with which role
 * — same CRUD-in-a-Modal shape as CharacterManager.tsx. Members are looked up by
 * username (not internal id), resolved server-side (see routes/project.ts's POST
 * /members). */
export function MemberManager({ onClose }: Props) {
  const { t } = useTranslation();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [members, setMembers] = useState<ProjectMemberView[] | null>(null);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<ProjectRole>("translator");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    api.listMembers().then(setMembers).catch((e) => setError(translateApiError(e, t)));
  }

  useEffect(refresh, [t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.addMember(username.trim(), role);
      setUsername("");
      refresh();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!(await confirm({ message: t("members.confirmRemove"), danger: true, confirmLabel: t("members.removeButton") }))) return;
    setBusy(true);
    setError(null);
    try {
      await api.removeMember(userId);
      refresh();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inspector" style={{ maxWidth: 420 }}>
      {confirmDialog}
      <p style={{ margin: 0, fontWeight: 600 }}>{t("members.title")}</p>

      <div className="language-manager-list">
        {members?.length === 0 && <p className="hint">{t("members.empty")}</p>}
        {members?.map((m) => (
          <div key={m.userId} className="language-manager-row">
            <span>
              {m.username ?? m.userId} <em>({t(`roles.${m.role}`)})</em>
            </span>
            <button onClick={() => handleRemove(m.userId)} disabled={busy} title={t("members.removeButton")}>
              ×
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="language-manager-form">
        <label>
          {t("members.usernameLabel")}
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          {t("members.roleLabel")}
          <select value={role} onChange={(e) => setRole(e.target.value as ProjectRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="primary" disabled={busy}>
          {t("members.addButton")}
        </button>
      </form>
      {error && <div className="language-manager-error">{error}</div>}

      {onClose && (
        <button type="button" onClick={onClose}>
          {t("common.close")}
        </button>
      )}
    </div>
  );
}
