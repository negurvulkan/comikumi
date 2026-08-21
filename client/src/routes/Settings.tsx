import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SettingsForm } from "../editor/SettingsForm";

export function Settings() {
  const { t } = useTranslation();
  return (
    <div className="page page-padded">
      <div className="page-scroll">
        <Link to="/" style={{ display: "inline-block", marginBottom: 12 }}>
          {t("settings.backLink")}
        </Link>
        <SettingsForm />
      </div>
    </div>
  );
}
