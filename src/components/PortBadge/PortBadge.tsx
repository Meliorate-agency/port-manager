import styles from "./PortBadge.module.css";

interface PortBadgeProps {
  port: number;
  dimmed?: boolean;
}

export default function PortBadge({ port, dimmed }: PortBadgeProps) {
  return (
    <span className={`${styles.badge} ${dimmed ? styles.dimmed : ""}`}>
      :{port}
    </span>
  );
}
