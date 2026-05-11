import "tailwindcss/tailwind.css";
import ReactDOM from "react-dom/client";
import { router } from "./router";
import { RouterProvider } from "react-router-dom";
import { Providers } from "./app/Providers";
import { AuthProvider } from "./auth/AuthContext";

const rootElement = document.getElementById("react-root");
if (!rootElement) throw new Error("React root not found");

const root = ReactDOM.createRoot(rootElement);
root.render(
  <AuthProvider>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </AuthProvider>
);
