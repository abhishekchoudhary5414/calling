import React from "react";
import Link from "next/link";
import { ArrowBack, SearchOffOutlined } from "@mui/icons-material";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.contentCard}>
        <div className={styles.iconCircle}>
          <SearchOffOutlined className={styles.searchIcon} />
        </div>
        <span className={styles.badge}>404 · Page Not Found</span>
        <h1 className={styles.title}>Lost in the Portal?</h1>
        <p className={styles.description}>
          The page or entity you are looking for does not exist, has been moved,
          or you do not have permission to access it.
        </p>
        <div className={styles.actionGroup}>
          <Link href="/dashboard" className={styles.btnPrimary}>
            <ArrowBack fontSize="small" /> Return to Dashboard
          </Link>
          <Link href="/" className={styles.btnOutline}>
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
