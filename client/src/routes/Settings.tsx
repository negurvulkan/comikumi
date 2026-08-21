import { Link } from "react-router-dom";
import { SettingsForm } from "../editor/SettingsForm";

export function Settings() {
  return (
    <div className="page page-padded">
      <div className="page-scroll">
        <Link to="/" style={{ display: "inline-block", marginBottom: 12 }}>
          ← zurück zur Bandliste
        </Link>
        <SettingsForm />
      </div>
    </div>
  );
}
