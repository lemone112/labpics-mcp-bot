"use client";

import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";

export function Drawer({ isOpen, onOpenChange, title, children, footer = null }) {
  return (
    <Modal
      isOpen={Boolean(isOpen)}
      onOpenChange={onOpenChange}
      placement="right"
      size="xl"
      scrollBehavior="inside"
      classNames={{
        base: "m-0 ml-auto h-full max-h-screen rounded-none border-l border-[var(--border-subtle)]",
        body: "p-4",
        header: "border-b border-[var(--border-subtle)] p-4",
        footer: "border-t border-[var(--border-subtle)] p-4",
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>{title}</ModalHeader>
            <ModalBody>{children}</ModalBody>
            {footer ? <ModalFooter>{footer({ onClose })}</ModalFooter> : null}
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
