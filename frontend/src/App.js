import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Onboarding from "@/pages/Onboarding";
import ActionsFormation from "@/pages/ActionsFormation";
import DossiersClotures from "@/pages/DossiersClotures";
import Formateurs from "@/pages/Formateurs";

export default function App() {
  return (
    <div className="App">
      <Toaster position="top-right" richColors closeButton />
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/actions" element={<ActionsFormation />} />
            <Route path="/formateurs" element={<Formateurs />} />
            <Route path="/archives" element={<DossiersClotures />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  );
}
