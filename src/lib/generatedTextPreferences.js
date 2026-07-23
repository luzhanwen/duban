import wordSubstitutionPreferences from "../prompts/wordSubstitutions.md?raw";

export function getWordSubstitutionPreferencesPrompt() {
  return wordSubstitutionPreferences.trim();
}

export function applyGeneratedTextPreferences(value) {
  const text = typeof value === "string" ? value : "";
  const preferences = parseWordSubstitutionPreferences();
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*>/.test(line)) return line;
      return line
        .split(/(《[^》]*》|“[^”]*”|「[^」]*」|『[^』]*』|`[^`]*`)/g)
        .map((segment, index) => {
          if (index % 2 === 1) return segment;
          return preferences.reduce(
            (result, preference) =>
              result.replaceAll(preference.source, preference.fallback),
            segment
          );
        })
        .join("");
    })
    .join("\n");
}

function parseWordSubstitutionPreferences() {
  return wordSubstitutionPreferences
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .map((line) => line.slice(1, -1).split("|").map((cell) => cell.trim()))
    .filter(
      ([source, fallback]) =>
        source &&
        fallback &&
        source !== "原词" &&
        !/^[-:]+$/.test(source) &&
        !/^[-:]+$/.test(fallback)
    )
    .map(([source, fallback]) => ({ source, fallback }));
}
