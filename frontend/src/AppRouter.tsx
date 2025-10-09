import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";

export function AppRouter() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/" element={<App />} />
      </Routes>
    </BrowserRouter>
  );
}
