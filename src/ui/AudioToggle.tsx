export interface AudioToggleProps {
  readonly muted: boolean;
  readonly onMutedChange: (muted: boolean) => void;
}

export function AudioToggle({ muted, onMutedChange }: AudioToggleProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    onMutedChange(!event.currentTarget.checked);
  }

  return (
    <label className="audio-toggle">
      <span className="audio-toggle__copy">
        <strong>Race sound</strong>
        <span>{muted ? "Muted by default" : "Sound on"}</span>
      </span>
      <input
        aria-label="Race audio"
        checked={!muted}
        onChange={handleChange}
        role="switch"
        type="checkbox"
      />
      <span aria-hidden="true" className="audio-toggle__indicator" />
    </label>
  );
}
