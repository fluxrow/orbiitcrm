import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2, Heading3,
  AlignLeft, AlignCenter, AlignRight, List, ListOrdered,
  Palette, Link as LinkIcon, ImagePlus, Undo2, Redo2, Type,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const ALLOWED_VARS = [
  { key: "nome", label: "Nome" },
  { key: "empresa", label: "Empresa" },
  { key: "nome_fantasia", label: "Nome Fantasia" },
  { key: "email", label: "Email" },
  { key: "telefone", label: "Telefone" },
  { key: "cidade", label: "Cidade" },
  { key: "segmento", label: "Segmento" },
];

const COLORS = [
  "#000000", "#374151", "#6B7280", "#EF4444", "#F97316", "#EAB308",
  "#22C55E", "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6", "#FFFFFF",
];

interface EmailTemplateEditorProps {
  content: string;
  onChange: (html: string) => void;
  className?: string;
}

function ToolbarButton({
  onClick, active, children, title,
}: {
  onClick: () => void; active?: boolean; children: React.ReactNode; title?: string;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "ghost"}
      size="sm"
      className="h-8 w-8 p-0"
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );
}

export function EmailTemplateEditor({ content, onChange, className }: EmailTemplateEditorProps) {
  const [linkUrl, setLinkUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
      Image.configure({ inline: false, allowBase64: true }),
      TextStyle,
      Color,
      Placeholder.configure({ placeholder: "Comece a escrever o conteúdo do email..." }),
    ],
    content,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[300px] focus:outline-none p-6 text-black [&_*]:text-inherit [&_.ProseMirror-tab]:inline-block [&_.ProseMirror-tab]:min-w-[2em]",
      },
      handleKeyDown(view, event) {
        if (event.key === 'Tab') {
          event.preventDefault();
          const { state, dispatch } = view;
          if (event.shiftKey) {
            // Remove tab/spaces at cursor
            const { from } = state.selection;
            const textBefore = state.doc.textBetween(Math.max(0, from - 4), from);
            if (textBefore === '    ') {
              dispatch(state.tr.delete(from - 4, from));
            } else if (textBefore.endsWith('\t')) {
              dispatch(state.tr.delete(from - 1, from));
            }
          } else {
            dispatch(state.tr.insertText('    '));
          }
          return true;
        }
        return false;
      },
      transformPastedHTML(html) {
        return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
      },
    },
  });

  useEffect(() => {
    if (editor && content && editor.getHTML() !== content && !editor.isFocused) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const insertVariable = useCallback(
    (varKey: string) => {
      if (editor) {
        editor.chain().focus().insertContent(`{{${varKey}}}`).run();
      }
    },
    [editor]
  );

  const setLink = useCallback(() => {
    if (!editor || !linkUrl) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl }).run();
    setLinkUrl("");
  }, [editor, linkUrl]);

  const addImage = useCallback(() => {
    if (!editor || !imageUrl) return;
    editor.chain().focus().setImage({ src: imageUrl }).run();
    setImageUrl("");
  }, [editor, imageUrl]);

  if (!editor) return null;

  return (
    <div className={cn("border rounded-lg overflow-hidden bg-card", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-2 border-b bg-muted/30">
        {/* Text format */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Negrito">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Itálico">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Sublinhado">
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Headings */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Título 1">
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Título 2">
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Título 3">
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Alignment */}
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Alinhar à esquerda">
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Centralizar">
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Alinhar à direita">
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Lists */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Lista">
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Lista numerada">
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Color */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Cor do texto">
              <Palette className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2">
            <div className="grid grid-cols-6 gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className="w-6 h-6 rounded border border-border"
                  style={{ backgroundColor: c }}
                  onClick={() => editor.chain().focus().setColor(c).run()}
                />
              ))}
            </div>
            <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => editor.chain().focus().unsetColor().run()}>
              Remover cor
            </Button>
          </PopoverContent>
        </Popover>

        {/* Link */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant={editor.isActive("link") ? "default" : "ghost"} size="sm" className="h-8 w-8 p-0" title="Inserir link">
              <LinkIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3">
            <Label className="text-xs">URL do link</Label>
            <div className="flex gap-2 mt-1">
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className="h-8 text-sm" />
              <Button size="sm" className="h-8" onClick={setLink}>OK</Button>
            </div>
            {editor.isActive("link") && (
              <Button variant="ghost" size="sm" className="w-full mt-1 text-xs text-destructive" onClick={() => editor.chain().focus().unsetLink().run()}>
                Remover link
              </Button>
            )}
          </PopoverContent>
        </Popover>

        {/* Image */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Inserir imagem">
              <ImagePlus className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3">
            <Label className="text-xs">URL da imagem</Label>
            <div className="flex gap-2 mt-1">
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className="h-8 text-sm" />
              <Button size="sm" className="h-8" onClick={addImage}>OK</Button>
            </div>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Undo/Redo */}
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Desfazer">
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Refazer">
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Variables bar */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b bg-muted/20">
        <Type className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground mr-1">Variáveis:</span>
        {ALLOWED_VARS.map((v) => (
          <Button
            key={v.key}
            type="button"
            variant="outline"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => insertVariable(v.key)}
          >
            {`{{${v.key}}}`}
          </Button>
        ))}
      </div>

      {/* Editor area */}
      <div className="bg-white text-black min-h-[350px]">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
