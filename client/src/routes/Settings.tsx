import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SettingsForm } from "../editor/SettingsForm";

export function Settings() {
  const { t } = useTranslation();
  const { projectId = "" } = useParams();
  return (
    <div className="page page-padded">
      <div className="page-scroll">
        <Link to={`/p/${encodeURIComponent(projectId)}`} style={{ display: "inline-block", marginBottom: 12 }}>
          {t("settings.backLink")}
        </Link>
        <SettingsForm />
      </div>
    </div>
  );
}
