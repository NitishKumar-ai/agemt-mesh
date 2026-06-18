import { Palette, PaletteMode, PaletteOptions } from "@mui/material";
import { ThemeOptions } from "@mui/material/styles";
import { colors } from "theme/tokens/variables";
import { FEATURES, featureFlags } from "utils/flags";

// TODO: get rid of these components after applying new inputs whole app
const enabledWhiteBackgroundForm = featureFlags.isEnabled(
  FEATURES.ENABLE_WHITE_BACKGROUND_FORM,
);

export const lightModePalette: Partial<PaletteOptions> = {
  primary: {
    main: "#4f46e5", // Vibrant Indigo
    light: "#818cf8",
    dark: "#3730a3",
    contrastText: "#ffffff",
  },
  success: {
    main: "#10b981", // Emerald
    light: "#34d399",
    dark: "#059669",
    contrastText: "#ffffff",
  },
  warning: {
    main: "#f59e0b", // Amber
    light: "#fbbf24",
    dark: "#d97706",
    contrastText: "#ffffff",
  },
  secondary: {
    main: "#64748b", // Slate
    light: "#94a3b8",
    dark: "#475569",
    contrastText: "#ffffff",
  },
  text: {
    primary: "#0f172a", // Slate 900
    secondary: "#475569", // Slate 600
    disabled: "#94a3b8",
    hint: "#94a3b8",
  },
  grey: {
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
    A100: "#f1f5f9",
    A200: "#e2e8f0",
    A400: "#94a3b8",
    A700: "#334155",
  },
  error: {
    main: "#ef4444", // Red
    light: "#f87171",
    dark: "#b91c1c",
    contrastText: "#ffffff",
  },
  background: {
    paper: "#ffffff",
    default: "#f8fafc", // Cool off-white
  },
  divider: "rgba(15, 23, 42, 0.08)",
  // Custom from here
  purple: {
    main: colors.purple,
    light: colors.lightPurple,
  },
  pink: {
    main: colors.errorTag,
  },
  faintGrey: colors.sidebarFaintGrey,
  tertiary: {
    main: colors.white,
    light: colors.white,
    dark: colors.white,
    contrastText: colors.sidebarGrey,
  },
  blue: {
    main: colors.blueLight,
    light: colors.blueLightMode,
    dark: colors.blueLightMode,
    contrastText: colors.blueLightMode,
  },
  input: {
    text: colors.sidebarBlacky,
    label: colors.sidebarUIVersion,
    border: colors.greyText2,
    focus: colors.blueLightMode,
    error: colors.errorRed,
    background: colors.white,
    disabled: colors.greyText,
  },
  label: {
    text: colors.sidebarGrey,
    disabled: colors.greyText,
  },
  green: {
    primary: colors.primaryGreen,
  },
  customBackground: {
    main: colors.sidebarBarelyPastWhite,
    form: enabledWhiteBackgroundForm ? colors.white : colors.gray14,
  },
};

export const darkModePalette: Partial<Palette> = {
  // Dark mode colors
  primary: {
    main: "#6366f1", // Indigo 500
    light: "#818cf8",
    dark: "#4338ca",
    contrastText: "#ffffff",
  },
  success: {
    main: "#10b981",
    light: "#34d399",
    dark: "#059669",
    contrastText: "#ffffff",
  },
  warning: {
    main: "#f59e0b",
    light: "#fbbf24",
    dark: "#d97706",
    contrastText: "#ffffff",
  },
  secondary: {
    main: "#94a3b8", // Slate 400
    light: "#cbd5e1",
    dark: "#64748b",
    contrastText: "#0f172a",
  },
  text: {
    primary: "#f8fafc",
    secondary: "#cbd5e1",
    disabled: "#64748b",
    hint: "#64748b",
  },
  grey: {
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
    A100: "#f1f5f9",
    A200: "#e2e8f0",
    A400: "#94a3b8",
    A700: "#334155",
  },
  error: {
    main: "#f87171",
    light: "#fca5a5",
    dark: "#dc2626",
    contrastText: "#ffffff",
  },
  background: {
    paper: "#1e293b", // Slate 800 - elevated
    default: "#0f172a", // Slate 900 - deep space background
  },
  divider: "rgba(248, 250, 252, 0.08)",
  // Custom from here
  purple: {
    main: colors.purple,
    light: colors.lightPurple,
  },
  pink: {
    main: colors.errorTag,
  },
  faintGrey: colors.sidebarFaintGrey,
  tertiary: {
    main: colors.white,
    light: colors.white,
    dark: colors.white,
    contrastText: colors.sidebarGrey,
  },
  blue: {
    main: colors.blueLight,
    light: colors.blueLightMode,
    dark: colors.blueLightMode,
    contrastText: colors.blueLightMode,
  },
  input: {
    text: colors.sidebarBlacky,
    label: colors.sidebarGrey,
    border: colors.greyText2,
    focus: colors.blueLight,
    error: colors.errorRed,
    background: colors.white,
    disabled: colors.greyText,
  },
  label: {
    text: colors.sidebarGrey,
    disabled: colors.greyText,
  },
  green: {
    primary: colors.primaryGreen,
  },
  customBackground: {
    main: colors.sidebarBarelyPastWhite,
    form: enabledWhiteBackgroundForm ? colors.white : colors.gray00,
  },
};

export const getPaletteForMode = (mode: PaletteMode): ThemeOptions => {
  return {
    palette: {
      mode,
      ...(mode === "light" ? lightModePalette : darkModePalette),
    },
  };
};
