import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "./app/AppRouter";
import { AppProviders } from "./app/providers";

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </AppProviders>
  );
}
