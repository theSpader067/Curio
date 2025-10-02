'use client'
import React, { useState, useEffect, useRef, FC, SetStateAction, Dispatch, KeyboardEvent, DragEvent, ChangeEvent, MouseEvent } from 'react';

// In a real project, you would put this in a global.d.ts file
// to extend the global Window interface for external libraries.
declare global {
    interface Window {
        pdfjsLib: any;
        jspdf: any;
    }
}

// --- Type Definitions ---
type NoteStatus = 'default' | 'important' | 'crucial';

interface Note {
  id: number;
  text: string;
  children: Note[];
  status: NoteStatus;
}

// --- Main App Component ---
const App: FC = () => {
    // State management for the application
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [isWandActive, setIsWandActive] = useState<boolean>(false);
    const [notes, setNotes] = useState<Note[]>([]);
    const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
    const [isRendering, setIsRendering] = useState<boolean>(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
    const pdfViewerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Effect to add custom font
     useEffect(() => {
        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Lora:wght@400;600&family=Inter:wght@400;500;600&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);
    }, []);


    // Effect to handle PDF rendering
    useEffect(() => {
        if (pdfFile) {
            renderPdf();
        }
    }, [pdfFile]);

    // Recursive helper function to add a child note
    const addChildToNote = (nodes: Note[], parentId: number, newNote: Note): Note[] => {
        return nodes.map(node => {
            if (node.id === parentId) {
                return { ...node, children: [...node.children, newNote] };
            }
            if (node.children && node.children.length > 0) {
                return { ...node, children: addChildToNote(node.children, parentId, newNote) };
            }
            return node;
        });
    };
    
    // Effect to handle text selection
    useEffect(() => {
        const handleSelection = () => {
            if (isWandActive) {
                const selection = window.getSelection();
                if (pdfViewerRef.current && selection && selection.rangeCount > 0 && pdfViewerRef.current.contains(selection.getRangeAt(0).commonAncestorContainer)) {
                    const text = selection.toString().trim();
                    if (text) {
                        const newNote: Note = { id: Date.now() + Math.random(), text, children: [], status: 'default' };
                        if (activeNoteId) {
                            setNotes(prevNotes => addChildToNote(prevNotes, activeNoteId, newNote));
                        } else {
                            setNotes(prevNotes => [...prevNotes, newNote]);
                        }
                        selection.removeAllRanges();
                    }
                }
            }
        };
        document.addEventListener('mouseup', handleSelection);
        return () => document.removeEventListener('mouseup', handleSelection);
    }, [isWandActive, activeNoteId]);
    
    // Effect to dynamically load external scripts, ensuring correct order for plugins
    useEffect(() => {
        // Load pdf.js
        if (!document.getElementById('pdfjs')) {
            const pdfjsScript = document.createElement('script');
            pdfjsScript.id = 'pdfjs';
            pdfjsScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js';
            pdfjsScript.onload = () => {
                if (window.pdfjsLib) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
                }
            };
            document.body.appendChild(pdfjsScript);
        }

        // Load jsPDF, then load the autoTable plugin in its callback
        if (!document.getElementById('jspdf')) {
            const jspdfScript = document.createElement('script');
            jspdfScript.id = 'jspdf';
            jspdfScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            jspdfScript.onload = () => {
                // Now that jsPDF is loaded, load the autoTable plugin
                if (!document.getElementById('jspdf-autotable')) {
                    const autoTableScript = document.createElement('script');
                    autoTableScript.id = 'jspdf-autotable';
                    autoTableScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js';
                    document.body.appendChild(autoTableScript);
                }
            };
            document.body.appendChild(jspdfScript);
        }
    }, []);

    // --- File Handling ---
    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type === 'application/pdf') {
            setNotes([]);
            setActiveNoteId(null);
            setPdfFile(file);
        }
    };

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => e.preventDefault();
    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            setNotes([]);
            setActiveNoteId(null);
            setPdfFile(file);
        }
    };

    // --- PDF Rendering ---
    const renderPdf = async () => {
        if (!pdfFile || !window.pdfjsLib || !pdfViewerRef.current) return;
        setIsRendering(true);
        const viewer = pdfViewerRef.current;
        viewer.innerHTML = '';

        const fileReader = new FileReader();
        fileReader.onload = async function() {
            const typedarray = new Uint8Array(this.result as ArrayBuffer);
            try {
                const pdfDoc = await window.pdfjsLib.getDocument({ data: typedarray }).promise;
                for (let i = 1; i <= pdfDoc.numPages; i++) {
                    const page = await pdfDoc.getPage(i);
                    const viewport = page.getViewport({ scale: (viewer.clientWidth - 32) / page.getViewport({ scale: 1.0 }).width });
                    
                    const pageContainer = document.createElement('div');
                    pageContainer.className = 'relative mb-4 shadow-lg rounded-sm overflow-hidden';
                    const canvas = document.createElement('canvas');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    const textLayerDiv = document.createElement('div');
                    textLayerDiv.className = 'textLayer absolute top-0 left-0 w-full h-full';

                    pageContainer.append(canvas, textLayerDiv);
                    viewer.appendChild(pageContainer);

                    const canvasContext = canvas.getContext('2d');
                    if (canvasContext) {
                        await page.render({ canvasContext, viewport }).promise;
                    }
                    const textContent = await page.getTextContent();
                    window.pdfjsLib.renderTextLayer({ textContent, container: textLayerDiv, viewport, textDivs: [] });
                }
            } catch (error) {
                console.error('Error rendering PDF:', error);
                viewer.innerHTML = '<p class="text-red-500">Error loading PDF. Please try another file.</p>';
            } finally {
                setIsRendering(false);
            }
        };
        fileReader.readAsArrayBuffer(pdfFile);
    };

    // --- Note Management ---
    const handleDeleteNote = (noteIdToDelete: number) => {
        if (activeNoteId === noteIdToDelete) setActiveNoteId(null);
        const removeNote = (nodes: Note[]): Note[] => nodes.filter(note => note.id !== noteIdToDelete).map(note => ({ ...note, children: removeNote(note.children) }));
        setNotes(prevNotes => removeNote(prevNotes));
    };
    
    const handleUpdateNoteText = (noteIdToUpdate: number, newText: string) => {
        const updateNote = (nodes: Note[]): Note[] => {
            return nodes.map(note => {
                if (note.id === noteIdToUpdate) return { ...note, text: newText };
                if (note.children.length > 0) return { ...note, children: updateNote(note.children) };
                return note;
            });
        };
        setNotes(prevNotes => updateNote(prevNotes));
    };
    
    const handleUpdateNoteStatus = (noteIdToUpdate: number, newStatus: NoteStatus) => {
        const updateStatus = (nodes: Note[]): Note[] => {
            return nodes.map(note => {
                if (note.id === noteIdToUpdate) return { ...note, status: newStatus };
                if (note.children.length > 0) return { ...note, children: updateStatus(note.children) };
                return note;
            });
        };
        setNotes(prevNotes => updateStatus(prevNotes));
    };

    const handleSetActiveNote = (noteId: number) => setActiveNoteId(prevId => (prevId === noteId ? null : noteId));

    // --- UI Event Handlers ---
    const toggleWand = () => setIsWandActive(!isWandActive);
    const clearAllNotes = () => {
        setNotes([]);
        setActiveNoteId(null);
    };

    // --- Component Styles ---
    const wandButtonClass = isWandActive ? 'bg-stone-700 text-white' : 'bg-white text-stone-600 hover:bg-stone-200';

    return (
        <>
            <div className={`flex h-screen bg-stone-100 font-body ${isWandActive ? 'cursor-text' : ''}`}>
                <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
                <main className={`flex-grow flex transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'}`}>
                    <div className="flex-grow w-2/3 flex flex-col p-6 overflow-hidden">
                        <header className="flex items-center justify-between pb-4">
                             <h1 className="text-2xl font-heading text-stone-800">Notes</h1>
                             <div className="flex items-center space-x-2">
                                 <button onClick={toggleWand} className={`px-3 py-1.5 text-sm rounded-md font-semibold transition-all duration-200 flex items-center space-x-2 border border-stone-300 ${wandButtonClass}`}>
                                    <WandIcon /> <span>Select Text</span>
                                </button>
                                <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 text-sm bg-stone-800 text-white rounded-md font-semibold hover:bg-stone-900 transition-colors">
                                    Upload PDF
                                 </button>
                             </div>
                        </header>
                        <div className="flex-grow bg-stone-200/70 mt-4 rounded-lg overflow-y-auto p-2 md:p-4 custom-scrollbar">
                            {isRendering && <div className="flex items-center justify-center h-full"><div className="text-center"><p className="text-lg font-semibold text-stone-700">Rendering PDF...</p><div className="loader mt-2"></div></div></div>}
                            {!pdfFile && !isRendering && (
                                 <div className="flex items-center justify-center h-full border-2 border-dashed border-stone-400 rounded-lg bg-stone-50" onDragOver={handleDragOver} onDrop={handleDrop}>
                                    <div className="text-center text-stone-500"><UploadIcon /><p className="mt-2 text-lg font-semibold">Drag & Drop PDF</p><p>or click 'Upload'</p></div>
                                </div>
                            )}
                            <div ref={pdfViewerRef} id="pdf-viewer"></div>
                        </div>
                    </div>

                    <div className="w-1/3 flex flex-col py-6 pr-6 overflow-hidden">
                         <header className="flex items-center justify-between pb-4">
                            <h2 className="text-2xl font-heading text-stone-800">My Notes</h2>
                            <div className="flex items-center space-x-3">
                                {notes.length > 0 && (
                                    <button onClick={() => setIsExportModalOpen(true)} className="text-sm text-stone-600 hover:text-stone-900 font-semibold flex items-center space-x-1.5 p-1 rounded-md hover:bg-stone-200 transition-colors">
                                        <ExportIcon />
                                        <span>Export</span>
                                    </button>
                                )}
                                <button onClick={clearAllNotes} className="text-sm text-red-500/80 hover:text-red-600 font-semibold disabled:opacity-50" disabled={notes.length === 0}>Clear All</button>
                            </div>
                        </header>
                        <div className="flex-grow mt-4 overflow-y-auto custom-scrollbar pr-2 -mr-2">
                            {notes.length > 0 ? notes.map((note, index) => <NoteItem key={note.id} note={note} isLastChild={index === notes.length - 1} level={0} activeNoteId={activeNoteId} onUpdateText={handleUpdateNoteText} onUpdateStatus={handleUpdateNoteStatus} onDeleteNote={handleDeleteNote} onSetActiveNote={handleSetActiveNote} />) : <p className="text-stone-500 text-sm">Activate the 'Select' wand and highlight text from the PDF to create notes. Double-click a note to edit.</p>}
                        </div>
                    </div>
                </main>
                
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".pdf" />
                <style>{`
                    :root { --font-heading: 'Lora', serif; --font-body: 'Inter', sans-serif; }
                    .font-heading { font-family: var(--font-heading); }
                    .font-body { font-family: var(--font-body); }
                    .custom-scrollbar::-webkit-scrollbar{width:8px;}.custom-scrollbar::-webkit-scrollbar-track{background:transparent;}.custom-scrollbar::-webkit-scrollbar-thumb{background:#c7c2b8;border-radius:10px;border:2px solid #e7e5e4;}.custom-scrollbar::-webkit-scrollbar-thumb:hover{background:#b0a99e;}
                    .textLayer>span{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%;}
                    .loader{border:4px solid #f3f3f3;border-radius:50%;border-top:4px solid #78716c;width:40px;height:40px;animation:spin 1.5s linear infinite;margin:0 auto;}
                    @keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}
                `}</style>
            </div>
            {isExportModalOpen && <ExportModal notes={notes} onClose={() => setIsExportModalOpen(false)} />}
        </>
    );
};


// --- Component Prop Types ---
interface SidebarProps {
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
}

interface NoteItemProps {
  note: Note;
  level: number;
  isLastChild: boolean;
  activeNoteId: number | null;
  onUpdateText: (id: number, text: string) => void;
  onUpdateStatus: (id: number, status: NoteStatus) => void;
  onDeleteNote: (id: number) => void;
  onSetActiveNote: (id: number) => void;
}

interface ExportModalProps {
    notes: Note[];
    onClose: () => void;
}

interface ReadOnlyNoteItemProps {
    note: Note;
    level?: number;
}

// --- Sidebar Component ---
const Sidebar: FC<SidebarProps> = ({ isOpen, setIsOpen }) => {
    return (
        <aside className={`fixed top-0 left-0 h-full bg-stone-800 text-stone-300 flex flex-col z-40 transition-all duration-300 ${isOpen ? 'w-64' : 'w-20'}`}>
            <div className="flex items-center justify-center h-20 border-b border-stone-700 px-4">
                 {isOpen ? (
                    <img src="https://storage.googleapis.com/maker-me/uploads/2024/09/29/4294d13e2f9d784a6c430e38a901ff80.jpg" alt="Curio Logo" className="h-10" />
                 ) : (
                    <WandIcon />
                 )}
            </div>
            <nav className="flex-grow mt-4">
                <a href="#" className="flex items-center py-3 px-6 hover:bg-stone-700 transition-colors">
                    <HomeIcon />
                    <span className={`ml-4 transition-opacity duration-200 whitespace-nowrap ${isOpen ? 'opacity-100' : 'opacity-0'}`}>Accueil</span>
                </a>
                <a href="#" className="flex items-center py-3 px-6 bg-stone-900/50 text-white transition-colors">
                    <NotesIcon />
                    <span className={`ml-4 transition-opacity duration-200 whitespace-nowrap ${isOpen ? 'opacity-100' : 'opacity-0'}`}>Notes</span>
                </a>
            </nav>
            <div className="p-4 border-t border-stone-700">
                <button onClick={() => setIsOpen(!isOpen)} className="p-2 rounded-lg hover:bg-stone-700 w-full flex items-center justify-center">
                    {isOpen ? <ChevronLeftIcon /> : <MenuIcon />}
                </button>
            </div>
        </aside>
    );
};

// --- NoteItem Component (Interactive) ---
const NoteItem: FC<NoteItemProps> = ({ note, level, isLastChild, activeNoteId, onUpdateText, onUpdateStatus, onDeleteNote, onSetActiveNote }) => {
    const [isHovered, setIsHovered] = useState<boolean>(false);
    const [isEditing, setIsEditing] = useState<boolean>(false);
    const [editedText, setEditedText] = useState<string>(note.text);
    const isActive = activeNoteId === note.id;
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    const statusClasses: Record<NoteStatus, string> = {
        default: 'bg-amber-50/60 hover:bg-amber-100/80 border-l-amber-400',
        important: 'bg-emerald-50/60 hover:bg-emerald-100/80 border-l-emerald-400',
        crucial: 'bg-red-50/60 hover:bg-red-100/80 border-l-red-400',
    };

    useEffect(() => {
        if (isEditing && textAreaRef.current) {
            textAreaRef.current.style.height = 'auto';
            textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
            textAreaRef.current.focus();
        }
    }, [isEditing, editedText]);

    const handleSave = () => {
        if (editedText.trim()) onUpdateText(note.id, editedText.trim());
        else setEditedText(note.text);
        setIsEditing(false);
    };
    
    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
        if (e.key === 'Escape') { setEditedText(note.text); setIsEditing(false); }
    };

    const handleStatusCycle = () => {
        const statuses: NoteStatus[] = ['default', 'important', 'crucial'];
        const currentIndex = statuses.indexOf(note.status);
        const nextIndex = (currentIndex + 1) % statuses.length;
        onUpdateStatus(note.id, statuses[nextIndex]);
    };

    return (
        <div className="relative" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
            <div
                className={`relative flex items-start space-x-3 transition-colors duration-200 border-l-4 rounded-r-md cursor-pointer ${statusClasses[note.status]}`}
                style={{ paddingLeft: `${level * 24 + 12}px` }}
                onClick={handleStatusCycle}
                onDoubleClick={() => setIsEditing(true)}
                title={`Status: ${note.status}. Click to change, double-click to edit.`}
            >
                <div className="absolute top-4 -left-px h-px bg-stone-300" style={{ width: '12px', left: `${level * 24}px`}}></div>
                {note.children.length > 0 && <div className="absolute top-4 left-0 h-full bg-stone-300 w-px" style={{ left: `${level * 24}px`}}></div>}
                {!isLastChild && level > 0 && <div className="absolute top-0 left-0 h-full bg-stone-300 w-px" style={{ left: `${(level-1) * 24}px`}}></div>}
                
                <div className="flex-grow py-2" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
                    {isEditing ? (
                         <textarea
                            ref={textAreaRef} value={editedText} onChange={(e) => setEditedText(e.target.value)} onBlur={handleSave} onKeyDown={handleKeyDown}
                            className="text-stone-800 text-sm flex-grow bg-stone-50 border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none w-full p-1"
                         />
                    ) : ( <p className="text-stone-700 text-sm leading-relaxed">{note.text}</p> )}
                </div>
                 <div className={`flex items-center space-x-1 transition-opacity duration-200 pr-2 z-10 ${isHovered ? 'opacity-100' : 'opacity-0'} ${isEditing ? 'opacity-0' : ''}`}>
                    <button onClick={(e) => { e.stopPropagation(); onSetActiveNote(note.id); }} title="Set as parent for new notes" className={`p-1 rounded transition-colors text-lg font-bold ${isActive ? 'bg-amber-100 text-amber-700' : 'text-stone-400 hover:bg-stone-200'}`}>↳</button>
                    <button onClick={(e) => { e.stopPropagation(); onDeleteNote(note.id); }} title="Delete note" className="text-stone-400 hover:text-red-500 font-bold text-xl p-1 rounded transition-colors">×</button>
                </div>
            </div>
            {note.children.length > 0 && (
                <div className="mt-1">
                    {note.children.map((child, index) => <NoteItem key={child.id} note={child} level={level + 1} isLastChild={index === note.children.length - 1} {...{activeNoteId, onUpdateText, onUpdateStatus, onDeleteNote, onSetActiveNote}}/>)}
                </div>
            )}
        </div>
    );
};

// --- Export Modal Component ---
const ExportModal: FC<ExportModalProps> = ({ notes, onClose }) => {
    const [activeTab, setActiveTab] = useState('pdf');
    const [flashcardContent, setFlashcardContent] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [copyStatus, setCopyStatus] = useState('Copy');
    
    const formatNotesToString = (notes: Note[], indent = ''): string => notes.map(note => `${indent}- ${note.text}\n${formatNotesToString(note.children, indent + '  ')}`).join('');
    const initialPrompt = `You are an expert study assistant. Your task is to convert a list of hierarchical notes into a text format suitable for importing into flashcard apps like Quizlet or Knowt. Use a tab character as a separator between the question (term) and the answer (definition). Each new flashcard must be on a new line.

For each main note, create a clear question. Use its sub-notes to form a comprehensive answer. If a note has no sub-notes, create a relevant question and a simple answer based on its content.

Here are the notes:
${formatNotesToString(notes)}
`;
    const [promptText, setPromptText] = useState(initialPrompt);
    
    const handleGenerateFlashcards = async () => {
        setIsGenerating(true);
        setFlashcardContent('');
        
        const apiKey = "";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{ parts: [{ text: promptText }] }],
        };

        try {
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
            setFlashcardContent(text || "Sorry, could not generate flashcards from the provided notes.");
        } catch (error) {
            console.error('Error generating flashcards:', error);
            setFlashcardContent(`An error occurred: ${(error as Error).message}`);
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleExportToPdf = () => {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            alert("PDF library is not loaded yet. Please try again in a moment.");
            return;
        }
        const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
         if (typeof (doc as any).autoTable !== 'function') {
            alert("PDF generation plugin is not ready. Please try again in a moment.");
            return;
        }

        const data: { indent: number; text: string; status: NoteStatus, parentChain: boolean[], isLastChild: boolean }[] = [];
        const processNotes = (nodes: Note[], level = 0, parentChain: boolean[] = []) => {
            nodes.forEach((note, index) => {
                const isLastChild = index === nodes.length - 1;
                data.push({ indent: level, text: note.text, status: note.status, parentChain, isLastChild });
                if (note.children.length > 0) {
                    processNotes(note.children, level + 1, [...parentChain, !isLastChild]);
                }
            });
        };
        processNotes(notes);

        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 30;
        const indentWidth = 20;

        (doc as any).autoTable({
            body: data,
            columns: [{ dataKey: 'text' }],
            theme: 'plain',
            startY: 40,
            margin: { left: margin, right: margin },
            styles: {
                font: 'Times',
                fontSize: 12,
                cellPadding: { top: 8, right: 8, bottom: 8, left: 8 },
                overflow: 'linebreak',
            },
            didDrawCell: (data: any) => {
                const note = data.row.raw as { indent: number; text: string; status: NoteStatus, parentChain: boolean[], isLastChild: boolean };
                const { cell, doc: jsdoc } = data;
                
                const colors: Record<NoteStatus, {bg: string, border: string}> = {
                    default: { bg: '#FEFDE8', border: '#FACC15' },
                    important: { bg: '#F0FDF4', border: '#34D399' },
                    crucial: { bg: '#FEF2F2', border: '#F87171' },
                };

                jsdoc.setFillColor(colors[note.status].bg);
                jsdoc.rect(cell.x, cell.y, cell.width, cell.height, 'F');
                jsdoc.setDrawColor(colors[note.status].border);
                jsdoc.line(cell.x, cell.y, cell.x, cell.y + cell.height);

                const textX = cell.x + (note.indent * indentWidth) + 15;
                const textWidth = cell.width - (textX - cell.x);
                const textLines = jsdoc.splitTextToSize(note.text, textWidth);

                jsdoc.setTextColor(51, 51, 51);
                jsdoc.setFontSize(12);
                jsdoc.setFont(undefined, note.indent === 0 ? 'bold' : 'normal');
                jsdoc.text(textLines, textX, cell.y + 12);
                
                // Draw tree lines
                jsdoc.setDrawColor(180, 180, 180);
                jsdoc.setLineWidth(0.5);

                note.parentChain.forEach((shouldDraw, i) => {
                    if (shouldDraw) {
                        jsdoc.line(cell.x + i * indentWidth + 8, cell.y, cell.x + i * indentWidth + 8, cell.y + cell.height);
                    }
                });
                
                if (note.indent > 0) {
                    const lineY = cell.y + 12;
                    const startX = cell.x + (note.indent - 1) * indentWidth + 8;
                    jsdoc.line(startX, lineY, startX + indentWidth, lineY);
                    if (!note.isLastChild) {
                        jsdoc.line(startX, cell.y, startX, cell.y + cell.height);
                    } else {
                        jsdoc.line(startX, cell.y, startX, lineY);
                    }
                }
            },
            didDrawRow: (data: any) => {
                const { doc: jsdoc, row } = data;
                const isLastRow = data.row.index === data.table.body.length - 1;
                
                // Don't draw line after the last row
                if (!isLastRow) {
                    jsdoc.setDrawColor(0, 0, 0);
                    jsdoc.setLineWidth(0.5);
                    const lineY = row.y + row.height + 5; // 5pt below current row
                    jsdoc.line(row.x + 10, lineY, row.x + row.width - 10, lineY);
                }
            }
        });

        doc.save("notes.pdf");
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(flashcardContent).then(() => {
            setCopyStatus('Copied!');
            setTimeout(() => setCopyStatus('Copy'), 2000);
        });
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-body">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <header className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-lg font-heading text-stone-800">Export Notes</h3>
                    <button onClick={onClose} className="text-2xl text-stone-500 hover:text-stone-800">&times;</button>
                </header>
                <nav className="flex border-b">
                    <button onClick={() => setActiveTab('pdf')} className={`flex-1 py-3 text-sm font-semibold border-b-2 ${activeTab === 'pdf' ? 'border-amber-600 text-amber-700' : 'border-transparent text-stone-600'}`}>Export to PDF</button>
                    <button onClick={() => setActiveTab('flashcards')} className={`flex-1 py-3 text-sm font-semibold border-b-2 ${activeTab === 'flashcards' ? 'border-amber-600 text-amber-700' : 'border-transparent text-stone-600'}`}>Generate Flashcards</button>
                </nav>
                <main className="p-6 flex-grow overflow-y-auto bg-stone-50">
                    {activeTab === 'pdf' ? (
                        <div>
                            <h4 className="font-semibold mb-3 text-stone-700">Notes Preview</h4>
                            <div className="bg-white border rounded-md p-4 max-h-96 overflow-y-auto custom-scrollbar">
                               {notes.map(note => <ReadOnlyNoteItem key={note.id} note={note} />)}
                            </div>
                            <button onClick={handleExportToPdf} className="mt-6 w-full px-4 py-2.5 bg-stone-800 text-white rounded-md font-semibold hover:bg-stone-900 transition-colors">Download PDF</button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                             <div>
                                 <label className="font-semibold text-stone-700 text-sm mb-2 block">AI Prompt</label>
                                 <textarea value={promptText} onChange={(e) => setPromptText(e.target.value)} className="w-full h-32 p-2 border rounded-md text-xs font-mono bg-stone-100 focus:bg-white focus:ring-1 focus:ring-amber-500 transition-colors" />
                             </div>
                             <button onClick={handleGenerateFlashcards} disabled={isGenerating} className="w-full px-4 py-2.5 bg-stone-800 text-white rounded-md font-semibold hover:bg-stone-900 transition-colors disabled:bg-stone-400">
                                {isGenerating ? 'Generating...' : 'Generate'}
                            </button>
                             {(isGenerating || flashcardContent) && (
                                <div>
                                    <label className="font-semibold text-stone-700 text-sm mb-2 block">Generated Flashcards</label>
                                    <div className="relative">
                                        <textarea readOnly value={isGenerating ? "AI is thinking..." : flashcardContent} className="w-full h-48 p-2 pr-12 border rounded-md text-xs font-mono bg-white" />
                                        {!isGenerating && flashcardContent && (
                                            <button onClick={handleCopy} title={copyStatus} className="absolute top-2 right-2 p-1.5 bg-stone-100 rounded-md text-stone-600 hover:bg-stone-200">
                                                {copyStatus === 'Copy' ? <CopyIcon /> : <CheckIcon />}
                                            </button>
                                        )}
                                    </div>
                                </div>
                             )}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

// --- ReadOnlyNoteItem Component (For Modal Preview) ---
const ReadOnlyNoteItem: FC<ReadOnlyNoteItemProps> = ({ note, level = 0 }) => (
    <div style={{ paddingLeft: `${level * 20}px` }} className="mb-1 text-sm">
        <p className="text-stone-800 flex"><span className="mr-2 text-stone-400">&bull;</span>{note.text}</p>
        {note.children.length > 0 && (
            <div className="mt-1">
                {note.children.map(child => <ReadOnlyNoteItem key={child.id} note={child} level={level + 1} />)}
            </div>
        )}
    </div>
);

// SVG Icon Components
const IconProps = { width:"24", height:"24", fill:"none", stroke:"currentColor", strokeWidth:"2", strokeLinecap:"round" as "round", strokeLinejoin:"round" as "round"};
const WandIcon: FC = ()=>(<svg {...IconProps} width="16" height="16" strokeWidth="2.5"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L11.8 8.2a1.88 1.88 0 0 0 0 2.64l4.56 4.56a1.88 1.88 0 0 0 2.64 0l6.84-6.84a1.21 1.21 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M3 8h4"/><path d="M6 18v-4"/><path d="M4 16h4"/><path d="m18 14-3-3"/><path d="M2 12h2.2"/><path d="M19.8 12h2.2"/><path d="M12 2.2V4"/><path d="M12 19.8V22"/></svg>);
const UploadIcon: FC = ()=>(<svg {...IconProps} className="h-16 w-16 mx-auto text-stone-400" strokeWidth={1.5}><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M12 15l-3-3m0 0l3-3m-3 3h12"/></svg>);
const ExportIcon: FC = ()=>(<svg {...IconProps} width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>);
const CopyIcon: FC = () => (<svg {...IconProps} width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>);
const CheckIcon: FC = () => (<svg {...IconProps} width="16" height="16" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>);
const HomeIcon: FC = () => <svg {...IconProps}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>;
const NotesIcon: FC = () => <svg {...IconProps}><path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1V14H6c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c0-1.1-.9-2-2-2h-1.5V3.6c0-.4-.2-.8-.5-1.1-.3-.3-.7-.5-1.1-.5z"></path><path d="M10 2v12h8V2h-8z"></path></svg>;
const MenuIcon: FC = () => <svg {...IconProps}><line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="6" y2="6"></line><line x1="4" x2="20" y1="18" y2="18"></line></svg>;
const ChevronLeftIcon: FC = () => <svg {...IconProps}><path d="m15 18-6-6 6-6"></path></svg>;


export default App;


