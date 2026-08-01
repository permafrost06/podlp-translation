import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Link as LinkIcon,
  Underline as UnderlineIcon,
  Unlink as UnlinkIcon,
} from "lucide-react";

import { fromEditorHtml, toEditorHtml } from "@/lib/html";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string; // strings.xml markup
  rtl?: boolean;
  onChange: (value: string) => void;
}

export function RichTextEditor({ value, rtl, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        code: false,
        strike: false,
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: false }),
    ],
    content: toEditorHtml(value),
    editorProps: {
      attributes: {
        class: cn(
          "min-h-[64px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring [&_p]:m-0",
          rtl && "text-right"
        ),
        dir: rtl ? "rtl" : "ltr",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(fromEditorHtml(editor.getHTML()));
    },
  });

  // Sync external value changes (e.g. switching cells/languages) without
  // clobbering in-progress typing.
  useEffect(() => {
    if (!editor) return;
    const current = fromEditorHtml(editor.getHTML());
    if (current !== value) {
      editor.commands.setContent(toEditorHtml(value), { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const btn = (active: boolean) =>
    cn(
      "flex h-7 w-7 items-center justify-center rounded hover:bg-accent",
      active && "bg-accent text-accent-foreground"
    );

  function setLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev || "https://");
    if (url === null) return; // cancelled
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  }

  return (
    <div>
      <BubbleMenu
        editor={editor}
        options={{ placement: "top" }}
        className="flex items-center gap-0.5 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <button
          type="button"
          title="Bold"
          className={btn(editor.isActive("bold"))}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <BoldIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Italic"
          className={btn(editor.isActive("italic"))}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Underline"
          className={btn(editor.isActive("underline"))}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Link"
          className={btn(editor.isActive("link"))}
          onClick={setLink}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </button>
        {editor.isActive("link") && (
          <button
            type="button"
            title="Remove link"
            className={btn(false)}
            onClick={() =>
              editor.chain().focus().extendMarkRange("link").unsetLink().run()
            }
          >
            <UnlinkIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </BubbleMenu>
      <EditorContent editor={editor} />
    </div>
  );
}
