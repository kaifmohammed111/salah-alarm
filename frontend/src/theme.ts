// Design tokens from /app/design_guidelines.json
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const RADIUS = { sm: 6, md: 12, lg: 20, pill: 999 };

export const FONTS = {
  regular: "Jakarta-Regular",
  medium: "Jakarta-Medium",
  semibold: "Jakarta-SemiBold",
  bold: "Jakarta-Bold",
};

export type ThemeColors = typeof LIGHT;

export const LIGHT = {
  surface: "#FFFFFF",
  onSurface: "#0F172A",
  surfaceSecondary: "#F8FAFC",
  onSurfaceSecondary: "#334155",
  surfaceTertiary: "#E2E8F0",
  onSurfaceTertiary: "#475569",
  brand: "#1E3A8A",
  brandPrimary: "#1E3A8A",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#3B82F6",
  brandTertiary: "#DBEAFE",
  onBrandTertiary: "#1E3A8A",
  success: "#059669",
  warning: "#D97706",
  error: "#DC2626",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  divider: "#F1F5F9",
  muted: "#94A3B8",
};

export const DARK: ThemeColors = {
  surface: "#0F172A",
  onSurface: "#F8FAFC",
  surfaceSecondary: "#1E293B",
  onSurfaceSecondary: "#CBD5E1",
  surfaceTertiary: "#334155",
  onSurfaceTertiary: "#94A3B8",
  brand: "#3B82F6",
  brandPrimary: "#1D4ED8",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#60A5FA",
  brandTertiary: "#1E3A8A",
  onBrandTertiary: "#DBEAFE",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  border: "#334155",
  borderStrong: "#475569",
  divider: "#1E293B",
  muted: "#64748B",
};
