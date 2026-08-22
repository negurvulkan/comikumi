import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { useConfirmDialog } from "./ConfirmDialog";
import { useSession } from "../state/SessionContext";
import type { PublicUser } from "../../../shared/src/users";

interface Props {
  onClose?: () => void;
}

/** System-admin screen: server-wide accounts — create/delete, independent of any one
 * project's own member list (see MemberManager.tsx for that). Same CRUD-in-a-Modal
 * shape as CharacterManager.tsx. */
export function UserManager({ onClose }: Props) {
  const { t } = useTranslation();
  const { user: me } = useSession();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    api.listUsers().then(setUsers).catch((e) => setError(translateApiError(e, t)));
  }

  useEffect(refresh, [t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createUser({ username: username.trim(), password, isSystemAdmin });
      setUsername("");
      setPassword("");
      setIsSystemAdmin(false);
      refresh();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    if (!(await confirm({ message: t("users.confirmRemove"), danger: true, confirmLabel: t("users.removeButton") }))) return;
    setBusy(true);
    setError(null);
    try {
      setUsers(await api.deleteUser(id));
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inspector" style={{ maxWidth: 420 }}>
      {confirmDialog}
      <p style={{ margin: 0, fontWeight: 600 }}>{t("users.title")}</p>

      <div className="language-manager-list">
        {users?.map((u) => (
          <div key={u.id} className="language-manager-row">
            <span>
              {u.username} {u.isSystemAdmin && <em>({t("roles.systemAdmin")})</em>}
            </span>
            {u.id !== me?.id && (
              <button onClick={() => handleRemove(u.id)} disabled={busy} title={t("users.removeButton")}>
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="language-manager-form">
        <label>
          {t("users.usernameLabel")}
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          {t("users.passwordLabel")}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={isSystemAdmin} onChange={(e) => setIsSystemAdmin(e.target.checked)} />
          {t("users.systemAdminLabel")}
        </label>
        <button type="submit" className="primary" disabled={busy}>
          {t("users.addButton")}
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
