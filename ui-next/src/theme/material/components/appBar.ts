import { colors } from "../../tokens/variables";
import { PaletteMode, Theme } from "@mui/material";
import { Components } from "@mui/material/styles";

export const appBar = (mode: PaletteMode): Components<Theme> => {
  return {
    MuiAppBar: {
      styleOverrides: {
        root: {
          ...(mode === "light"
            ? {
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                color: "#4f46e5",
                fontSize: "11pt !important",
                fontWeight: 500,
                borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
              }
            : {
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                color: "#818cf8",
                fontSize: "11pt !important",
                fontWeight: 500,
                borderBottom: "1px solid rgba(248, 250, 252, 0.08)",
              }),
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: "none !important",
          transition: "background-color 0.3s ease, border-color 0.3s ease",
          "& .MuiLink-underlineHover:hover": {
            textDecoration: "none !important",
          },
        },
      },
    },
  };
};

export default appBar;
