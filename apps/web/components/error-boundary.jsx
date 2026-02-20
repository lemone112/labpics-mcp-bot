"use client";

import { Component } from "react";

import { InlineError, PageError, SectionError } from "@/components/ui/error-state";

// ── Error Boundary ─────────────────────────────────────────────

/**
 * ErrorBoundary — catches React rendering errors at different levels.
 *
 * Levels:
 * - "app" — full-page error, shows PageError
 * - "page" — page-level error, shows PageError (nav still works)
 * - "section" — section-level, shows SectionError (rest of page works)
 * - "component" — component-level, shows InlineError (minimal disruption)
 *
 * @param {{
 *   level?: import("@/types/error-recovery").ErrorBoundaryLevel,
 *   fallback?: React.ReactNode,
 *   title?: string,
 *   onError?: (error: Error, errorInfo: React.ErrorInfo) => void,
 *   children: React.ReactNode,
 * }} props
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("[ErrorBoundary]", error, errorInfo);
    }

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // Use custom fallback if provided
    if (this.props.fallback) {
      return this.props.fallback;
    }

    const level = this.props.level || "section";
    const error = this.state.error;

    switch (level) {
      case "app":
      case "page":
        return <PageError error={error} reset={this.handleReset} />;

      case "section":
        return (
          <SectionError
            title={this.props.title || "Ошибка загрузки раздела"}
            error={error}
            onRetry={this.handleReset}
          />
        );

      case "component":
      default:
        return (
          <InlineError
            error={error}
            onRetry={this.handleReset}
            compact
          />
        );
    }
  }
}
