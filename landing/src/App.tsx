import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Providers from "./components/Providers";
import Bento from "./components/Bento";
import Comparison from "./components/Comparison";
import QuickStart from "./components/QuickStart";
import Architecture from "./components/Architecture";
import Footer from "./components/Footer";

function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-canvas" />
      <div className="dot-matrix absolute inset-x-0 top-0 h-[720px] [mask-image:linear-gradient(to_bottom,black_55%,transparent)]" />
    </div>
  );
}

export default function App() {
  return (
    <div className="relative min-h-screen bg-canvas font-sans text-fg2">
      <Background />
      <Navbar />
      <main>
        <Hero />
        <Providers />
        <Bento />
        <Comparison />
        <QuickStart />
        <Architecture />
      </main>
      <Footer />
    </div>
  );
}
