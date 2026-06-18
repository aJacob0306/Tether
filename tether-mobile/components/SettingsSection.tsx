import { ReactNode } from "react";
import { Text, View } from "react-native";
import { appStyles } from "../constants/styles";

type SettingsSectionProps = {
  title: string;
  children: ReactNode;
  footer?: string;
};

export function SettingsSection({ title, children, footer }: SettingsSectionProps) {
  return (
    <View style={appStyles.settingsSection}>
      <Text style={appStyles.settingsSectionTitle}>{title}</Text>
      <View style={appStyles.settingsGroup}>{children}</View>
      {footer ? <Text style={appStyles.settingsSectionFooter}>{footer}</Text> : null}
    </View>
  );
}

type SettingsRowProps = {
  label: string;
  value?: string;
  hint?: string;
  children?: ReactNode;
  last?: boolean;
};

export function SettingsRow({ label, value, hint, children, last }: SettingsRowProps) {
  return (
    <View style={[appStyles.settingsRow, last && appStyles.settingsRowLast]}>
      <View style={appStyles.settingsRowBody}>
        <Text style={appStyles.settingsRowLabel}>{label}</Text>
        {value ? <Text style={appStyles.settingsRowValue}>{value}</Text> : null}
        {hint ? <Text style={appStyles.settingsRowHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}
