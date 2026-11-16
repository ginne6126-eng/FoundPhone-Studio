import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Phone } from "../Phone";
import { validateWork, type Work } from "../schema";
import "../styles.css";
import "./player.css";
import AutismExperience from "./AutismExperience";

function PhoneStoryPlayer() {
  const [work, setWork] = useState<Work | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch(
      new URLSearchParams(location.search).get("preview") === "test"
        ? "./test-work.json"
        : new URLSearchParams(location.search).get("template") === "blank"
          ? "./blank-work.json"
          : "./work.json",
      { signal: abort.signal },
    )
      .then((r) => {
        if (!r.ok) throw Error("缺少作品文件，请运行 npm run story:build");
        return r.json();
      })
      .then((x) => {
        const w = validateWork(x);
        document.title = w.title === "捡手机" ? "捡手机" : w.title + " · 捡手机";
        setWork(w);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e));
      });
    return () => abort.abort();
  }, []);
  return <main className="story-runtime">{work ? <Phone work={work} /> : <p role="status">{error || "正在打开手机…"}</p>}</main>;
}

function Entry() {
  const params = new URLSearchParams(location.search);
  const phoneMode = params.get("phone") === "1"
    || params.get("preview") === "test"
    || params.get("template") === "blank";
  const chaptersMode = params.get("chapters") === "1";
  useEffect(() => {
    if (!phoneMode && !chaptersMode) {
      document.title = "星星的孩子｜走进孤独症的世界";
      window.location.replace(new URL("./experience/index.html", window.location.href).toString());
    }
  }, [phoneMode, chaptersMode]);
  return phoneMode ? <PhoneStoryPlayer /> : chaptersMode ? <AutismExperience /> : <main className="story-runtime" aria-live="polite">正在进入陌生星球…</main>;
}

createRoot(document.getElementById("root")!).render(<Entry />);
