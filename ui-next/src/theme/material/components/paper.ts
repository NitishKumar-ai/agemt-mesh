const paper = {
  MuiPaper: {
    defaultProps: {
      elevation: 0,
    },
    styleOverrides: {
      borderRadius: "12px",
      boxShadow:
        "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)",
      border: "1px solid rgba(15, 23, 42, 0.05)",
      transition: "box-shadow 0.3s ease-in-out, transform 0.3s ease-in-out",
    },
  },
};

export default paper;
