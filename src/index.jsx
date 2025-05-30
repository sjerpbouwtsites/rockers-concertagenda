import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

const domNode = document.getElementById("root");
const root = createRoot(domNode);

root.render(<App />);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
