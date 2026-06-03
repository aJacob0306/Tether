import { StyleSheet } from "react-native";

export const authStyles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#555",
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16,
    color: "#111",
  },
  primaryButton: {
    backgroundColor: "#111",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  linkButton: {
    marginTop: 20,
    alignItems: "center",
  },
  linkText: {
    fontSize: 14,
    color: "#555",
  },
  linkTextBold: {
    color: "#111",
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  error: {
    marginTop: 16,
    fontSize: 14,
    color: "#b00020",
  },
});

export const appStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#555",
    marginBottom: 24,
  },
  tabLoader: {
    marginVertical: 32,
  },
  tabCard: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    backgroundColor: "#fafafa",
  },
  tabTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111",
    marginBottom: 8,
  },
  tabUrl: {
    fontSize: 14,
    color: "#2563eb",
    marginBottom: 8,
  },
  tabUpdated: {
    fontSize: 12,
    color: "#666",
  },
  signedInAs: {
    fontSize: 13,
    color: "#666",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  hint: {
    fontSize: 14,
    color: "#555",
  },
  error: {
    marginTop: 16,
    fontSize: 14,
    color: "#b00020",
  },
  primaryButton: {
    backgroundColor: "#111",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#f3f3f3",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  secondaryButtonText: {
    color: "#111",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  screen: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
  },
  screenHeader: {
    marginBottom: 24,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
    gap: 12,
  },
  tetherCard: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 12,
    padding: 16,
    backgroundColor: "#fafafa",
  },
  tetherCardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111",
    marginBottom: 4,
  },
  tetherCardMeta: {
    fontSize: 13,
    color: "#666",
  },
  memberCard: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 12,
    padding: 16,
    backgroundColor: "#fafafa",
  },
  memberHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusWorking: {
    backgroundColor: "#16a34a",
  },
  statusIdle: {
    backgroundColor: "#ca8a04",
  },
  statusOffline: {
    backgroundColor: "#9ca3af",
  },
  memberName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
    flex: 1,
  },
  memberStatus: {
    fontSize: 12,
    color: "#666",
    textTransform: "uppercase",
    fontWeight: "600",
  },
  memberTabTitle: {
    fontSize: 15,
    color: "#111",
    marginBottom: 4,
  },
  memberMeta: {
    fontSize: 12,
    color: "#666",
  },
  inviteCode: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 2,
    color: "#111",
    marginVertical: 8,
  },
  rowActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  flexButton: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  linkText: {
    fontSize: 14,
    color: "#2563eb",
    fontWeight: "600",
  },
  emptyState: {
    fontSize: 14,
    color: "#555",
    marginTop: 8,
  },
});
