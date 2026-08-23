import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, type ProjectMemberView } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { useSession } from "../state/SessionContext";
import type { ProjectRole, PublicUser } from "../../../shared/src/users";
import { useConfirmDialog } from "../editor/ConfirmDialog";
import { useProject } from "../state/ProjectContext";

interface AdminProject {
  filePath: string;
  name: string;
  coverImagePath?: string;
  isAdmin: boolean;
  isArchived: boolean;
}

export function AdminDashboard() {
  const { t } = useTranslation();
  const { user: me } = useSession();
  const { project: activeProject } = useProject();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab State
  const activeTab = searchParams.get("tab") || (me?.isSystemAdmin ? "accounts" : "projects");

  // Global Accounts State
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PublicUser | null>(null);
  const [selectedUserPassword, setSelectedUserPassword] = useState("");
  const [selectedUserIsAdmin, setSelectedUserIsAdmin] = useState(false);

  // Projects & Members State
  const [projects, setProjects] = useState<AdminProject[] | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<AdminProject | null>(null);
  const [members, setMembers] = useState<ProjectMemberView[] | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [newMemberUsername, setNewMemberUsername] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<ProjectRole>("translator");

  // Profile State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Common State
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load data based on active tab
  useEffect(() => {
    setError(null);
    setSuccessMsg(null);
    if (activeTab === "accounts" && me?.isSystemAdmin) {
      setBusy(true);
      api.listUsers()
        .then(setUsers)
        .catch((e) => setError(translateApiError(e, t)))
        .finally(() => setBusy(false));
    } else if (activeTab === "projects") {
      setBusy(true);
      api.listProjectsForAdmin()
        .then((data) => {
          setProjects(data);
          // Auto-select active project or first project if none is selected yet
          if (data.length > 0 && !selectedProject) {
            const foundActive = data.find((p) => p.filePath === activeProject?.filePath);
            setSelectedProject(foundActive || data[0]);
          }
        })
        .catch((e) => setError(translateApiError(e, t)))
        .finally(() => setBusy(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, me, activeProject]);

  // Load members when selected project changes
  useEffect(() => {
    if (activeTab === "projects" && selectedProject) {
      setError(null);
      setSuccessMsg(null);
      api.listMembers(selectedProject.filePath)
        .then(setMembers)
        .catch((e) => setError(translateApiError(e, t)));
    }
  }, [selectedProject, activeTab, t]);

  const switchTab = (tab: string) => {
    setSearchParams({ tab });
    setSelectedUser(null);
    setError(null);
    setSuccessMsg(null);
  };

  // --- Account Actions ---
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserUsername.trim() || !newUserPassword.trim()) return;
    setError(null);
    setSuccessMsg(null);
    setBusy(true);
    try {
      await api.createUser({
        username: newUserUsername.trim(),
        password: newUserPassword,
        isSystemAdmin: newUserIsAdmin,
      });
      setNewUserUsername("");
      setNewUserPassword("");
      setNewUserIsAdmin(false);
      setSuccessMsg(t("admin.userCreatedSuccess"));
      // Refresh list
      const nextUsers = await api.listUsers();
      setUsers(nextUsers);
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleEditUserSelect = (u: PublicUser) => {
    setSelectedUser(u);
    setSelectedUserPassword("");
    setSelectedUserIsAdmin(u.isSystemAdmin);
    setError(null);
    setSuccessMsg(null);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setError(null);
    setSuccessMsg(null);
    setBusy(true);
    try {
      const updates: { password?: string; isSystemAdmin?: boolean } = {};
      if (selectedUserPassword) updates.password = selectedUserPassword;
      if (selectedUser.id !== me?.id) updates.isSystemAdmin = selectedUserIsAdmin;

      await api.updateUser(selectedUser.id, updates);
      setSelectedUserPassword("");
      setSuccessMsg(t("admin.userUpdatedSuccess"));
      // Refresh list
      const nextUsers = await api.listUsers();
      setUsers(nextUsers);
      // Update selectedUser reference
      const updated = nextUsers.find((u) => u.id === selectedUser.id);
      if (updated) setSelectedUser(updated);
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteUser = async (u: PublicUser) => {
    if (u.id === me?.id) return;
    if (!(await confirm({ message: t("users.confirmRemove"), danger: true, confirmLabel: t("users.removeButton") }))) return;
    setError(null);
    setSuccessMsg(null);
    setBusy(true);
    try {
      const remainingUsers = await api.deleteUser(u.id);
      setUsers(remainingUsers);
      if (selectedUser?.id === u.id) setSelectedUser(null);
      setSuccessMsg(t("admin.userDeletedSuccess"));
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  };

  // --- Project Member Actions ---
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !newMemberUsername.trim()) return;
    setError(null);
    setSuccessMsg(null);
    setBusy(true);
    try {
      await api.addMember(newMemberUsername.trim(), newMemberRole, selectedProject.filePath);
      setNewMemberUsername("");
      setSuccessMsg(t("admin.memberAddedSuccess"));
      // Refresh members
      const nextMembers = await api.listMembers(selectedProject.filePath);
      setMembers(nextMembers);
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleRoleChange = async (m: ProjectMemberView, role: ProjectRole) => {
    if (!selectedProject) return;
    setError(null);
    setSuccessMsg(null);
    setBusy(true);
    try {
      await api.addMember(m.username || m.userId, role, selectedProject.filePath);
      setSuccessMsg(t("admin.roleUpdatedSuccess"));
      // Refresh members
      const nextMembers = await api.listMembers(selectedProject.filePath);
      setMembers(nextMembers);
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (m: ProjectMemberView) => {
    if (!selectedProject) return;
    if (!(await confirm({ message: t("members.confirmRemove"), danger: true, confirmLabel: t("members.removeButton") }))) return;
    setError(null);
    setSuccessMsg(null);
    setBusy(true);
    try {
      await api.removeMember(m.userId, selectedProject.filePath);
      setSuccessMsg(t("admin.memberRemovedSuccess"));
      // Refresh members
      const nextMembers = await api.listMembers(selectedProject.filePath);
      setMembers(nextMembers);
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  };

  // --- Profile Actions ---
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) return;
    setError(null);
    setSuccessMsg(null);

    if (newPassword !== confirmPassword) {
      setError(t("setup.passwordMismatch"));
      return;
    }

    setBusy(true);
    try {
      await api.changeOwnPassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccessMsg(t("admin.passwordChangedSuccess"));
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  };

  // --- Filter Logic ---
  const filteredUsers = users?.filter((u) =>
    u.username.toLowerCase().includes(userSearch.toLowerCase())
  ) || [];

  const filteredProjects = projects?.filter((p) =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase())
  ) || [];

  const filteredMembers = members?.filter((m) =>
    (m.username || "").toLowerCase().includes(memberSearch.toLowerCase())
  ) || [];

  const ROLES: ProjectRole[] = ["viewer", "translator", "letterer", "admin"];

  return (
    <div className="page page-padded" style={{ display: "flex", flexDirection: "row", gap: 20, height: "100%", padding: 20 }}>
      {confirmDialog}

      {/* Sidebar for Navigation */}
      <div style={{ flex: "0 0 240px", display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{t("admin.title")}</h2>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {me?.isSystemAdmin && (
            <button
              type="button"
              className={activeTab === "accounts" ? "primary" : ""}
              style={{ textAlign: "left", padding: "10px 12px" }}
              onClick={() => switchTab("accounts")}
            >
              {t("users.title")}
            </button>
          )}
          <button
            type="button"
            className={activeTab === "projects" ? "primary" : ""}
            style={{ textAlign: "left", padding: "10px 12px" }}
            onClick={() => switchTab("projects")}
          >
            {t("admin.tabProjects")}
          </button>
          <button
            type="button"
            className={activeTab === "profile" ? "primary" : ""}
            style={{ textAlign: "left", padding: "10px 12px" }}
            onClick={() => switchTab("profile")}
          >
            {t("admin.tabProfile")}
          </button>
        </div>

        <div style={{ marginTop: "auto", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <Link to="/" className="button" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
            {t("settings.backLink")}
          </Link>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        
        {/* Banner Messages */}
        {error && <div className="error-banner" style={{ margin: 16 }}>{error}</div>}
        {successMsg && <div style={{ background: "#2e7d32", color: "#fff", padding: "10px 16px", margin: 16, borderRadius: 4, fontSize: 13 }}>{successMsg}</div>}

        {/* Tab 1: Global Accounts */}
        {activeTab === "accounts" && me?.isSystemAdmin && (
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            {/* User List Panel */}
            <div style={{ flex: 1, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", padding: 16 }}>
              <input
                type="text"
                placeholder={t("admin.searchUsersPlaceholder")}
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{ marginBottom: 12 }}
              />
              <div className="page-scroll" style={{ flex: 1 }}>
                {users === null ? (
                  <p>{t("common.loading")}</p>
                ) : filteredUsers.length === 0 ? (
                  <p className="hint">{t("admin.noUsersFound")}</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {filteredUsers.map((u) => (
                      <div
                        key={u.id}
                        onClick={() => handleEditUserSelect(u)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 6,
                          background: selectedUser?.id === u.id ? "var(--bg)" : "transparent",
                          border: "1px solid " + (selectedUser?.id === u.id ? "var(--accent)" : "transparent"),
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}
                      >
                        <span style={{ fontWeight: u.id === me.id ? "bold" : "normal" }}>
                          {u.username} {u.isSystemAdmin && <em style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>({t("roles.systemAdmin")})</em>}
                          {u.id === me.id && <em style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>({t("admin.badgeYou")})</em>}
                        </span>
                        {u.id !== me.id && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteUser(u);
                            }}
                            disabled={busy}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--danger)",
                              padding: "2px 8px",
                              cursor: "pointer",
                              fontSize: 16
                            }}
                            title={t("users.removeButton")}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Forms Panel */}
            <div style={{ flex: "0 0 320px", padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
              {selectedUser ? (
                <form onSubmit={handleUpdateUser} className="inspector" style={{ margin: 0, padding: 0, border: "none" }}>
                  <p style={{ margin: "0 0 12px", fontWeight: 600 }}>{t("admin.editUserTitle", { name: selectedUser.username })}</p>
                  <label>
                    {t("users.passwordLabel")}
                    <input
                      type="password"
                      placeholder={t("admin.leaveBlankToKeep")}
                      value={selectedUserPassword}
                      onChange={(e) => setSelectedUserPassword(e.target.value)}
                    />
                  </label>
                  {selectedUser.id !== me.id && (
                    <label style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                      <input
                        type="checkbox"
                        checked={selectedUserIsAdmin}
                        onChange={(e) => setSelectedUserIsAdmin(e.target.checked)}
                      />
                      {t("users.systemAdminLabel")}
                    </label>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button type="submit" className="primary" disabled={busy} style={{ flex: 1 }}>
                      {t("common.save")}
                    </button>
                    <button type="button" onClick={() => setSelectedUser(null)} style={{ flex: 1 }}>
                      {t("common.cancel")}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleCreateUser} className="inspector" style={{ margin: 0, padding: 0, border: "none" }}>
                  <p style={{ margin: "0 0 12px", fontWeight: 600 }}>{t("users.addButton")}</p>
                  <label>
                    {t("users.usernameLabel")}
                    <input
                      value={newUserUsername}
                      onChange={(e) => setNewUserUsername(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    {t("users.passwordLabel")}
                    <input
                      type="password"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      required
                    />
                  </label>
                  <label style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={newUserIsAdmin}
                      onChange={(e) => setNewUserIsAdmin(e.target.checked)}
                    />
                    {t("users.systemAdminLabel")}
                  </label>
                  <button type="submit" className="primary" disabled={busy} style={{ marginTop: 12 }}>
                    {t("users.addButton")}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Projects & Members */}
        {activeTab === "projects" && (
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            {/* Projects List Sidebar */}
            <div style={{ flex: "0 0 260px", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", padding: 16 }}>
              <input
                type="text"
                placeholder={t("admin.searchProjectsPlaceholder")}
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                style={{ marginBottom: 12 }}
              />
              <div className="page-scroll" style={{ flex: 1 }}>
                {projects === null ? (
                  <p>{t("common.loading")}</p>
                ) : filteredProjects.length === 0 ? (
                  <p className="hint">{t("admin.noProjectsFound")}</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {filteredProjects.map((p) => (
                      <div
                        key={p.filePath}
                        onClick={() => setSelectedProject(p)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 6,
                          background: selectedProject?.filePath === p.filePath ? "var(--bg)" : "transparent",
                          border: "1px solid " + (selectedProject?.filePath === p.filePath ? "var(--accent)" : "transparent"),
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontWeight: "bold", fontSize: 13, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", marginTop: 2 }}>
                          {p.filePath}
                        </div>
                        {p.isArchived && (
                          <span style={{ display: "inline-block", background: "var(--border)", color: "var(--text-muted)", fontSize: 10, padding: "2px 6px", borderRadius: 4, marginTop: 4 }}>
                            {t("projectSwitcher.archivedHeading")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Selected Project Members Panel */}
            <div style={{ flex: 1, display: "flex", flexDirection: "row", minHeight: 0 }}>
              {selectedProject ? (
                <>
                  {/* Members List */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 16, borderRight: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <h3 style={{ margin: 0, fontSize: 15 }}>{t("members.title")}</h3>
                      <input
                        type="text"
                        placeholder={t("admin.searchMembersPlaceholder")}
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        style={{ width: 160, margin: 0, padding: "4px 8px", fontSize: 12 }}
                      />
                    </div>
                    
                    <div className="page-scroll" style={{ flex: 1 }}>
                      {members === null ? (
                        <p>{t("common.loading")}</p>
                      ) : filteredMembers.length === 0 ? (
                        <p className="hint">{t("members.empty")}</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {filteredMembers.map((m) => (
                            <div
                              key={m.userId}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 6,
                                background: "var(--bg)",
                                border: "1px solid var(--border)",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center"
                              }}
                            >
                              <span>
                                {m.username || m.userId} {m.userId === me?.id && <em style={{ fontSize: 11, color: "var(--text-muted)" }}>({t("admin.badgeYou")})</em>}
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <select
                                  value={m.role}
                                  onChange={(e) => handleRoleChange(m, e.target.value as ProjectRole)}
                                  disabled={busy || m.userId === me?.id}
                                  style={{ padding: "4px 8px", fontSize: 12 }}
                                >
                                  {ROLES.map((r) => (
                                    <option key={r} value={r}>
                                      {t(`roles.${r}`)}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMember(m)}
                                  disabled={busy || m.userId === me?.id}
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--danger)",
                                    fontSize: 16,
                                    cursor: "pointer"
                                  }}
                                  title={t("members.removeButton")}
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Add Member Panel */}
                  <div style={{ flex: "0 0 240px", padding: 16 }}>
                    <form onSubmit={handleAddMember} className="inspector" style={{ margin: 0, padding: 0, border: "none" }}>
                      <p style={{ margin: "0 0 12px", fontWeight: 600 }}>{t("members.addButton")}</p>
                      <label>
                        {t("members.usernameLabel")}
                        <input
                          value={newMemberUsername}
                          onChange={(e) => setNewMemberUsername(e.target.value)}
                          placeholder={t("admin.inviteUsernamePlaceholder")}
                          required
                          disabled={busy}
                        />
                      </label>
                      <label>
                        {t("members.roleLabel")}
                        <select
                          value={newMemberRole}
                          onChange={(e) => setNewMemberRole(e.target.value as ProjectRole)}
                          disabled={busy}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t(`roles.${r}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit" className="primary" disabled={busy} style={{ marginTop: 12 }}>
                        {t("members.addButton")}
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                  {t("admin.selectProjectHint")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: My Profile */}
        {activeTab === "profile" && (
          <div style={{ padding: 24, maxWidth: 360, margin: "0 auto" }}>
            <form onSubmit={handleChangePassword} className="inspector" style={{ margin: 0, padding: 0, border: "none" }}>
              <p style={{ margin: "0 0 16px", fontWeight: 600, fontSize: 15 }}>{t("admin.profileChangePasswordTitle")}</p>
              
              <label>
                {t("admin.currentPasswordLabel")}
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  disabled={busy}
                />
              </label>

              <label>
                {t("admin.newPasswordLabel")}
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={busy}
                />
              </label>

              <label>
                {t("admin.confirmNewPasswordLabel")}
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={busy}
                />
              </label>

              <button type="submit" className="primary" disabled={busy} style={{ marginTop: 16 }}>
                {t("admin.profileChangePasswordButton")}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}
