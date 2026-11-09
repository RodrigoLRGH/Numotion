import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "./app/auth";
import { crearRouter } from "./app/router";
import "./styles/global.css";

createRoot(document.getElementById("raiz")!).render(
    <StrictMode>
        <AuthProvider>
            <RouterProvider router={crearRouter()} />
        </AuthProvider>
    </StrictMode>,
);
