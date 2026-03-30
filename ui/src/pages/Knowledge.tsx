import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompany } from "../context/CompanyContext";
import { api } from "../api/client";
import { BookOpen, Search, Plus, Trash2, FileText } from "lucide-react";

interface KnowledgeDocument {
  id: string;
  title: string | null;
  sourceType: string;
  sourcePath: string | null;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string | null;
  sourcePath: string | null;
  content: string;
  score: number;
  matchType: string;
}

export function Knowledge() {
  const { selectedCompany: company } = useCompany();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const { data: documents, isLoading } = useQuery({
    queryKey: ["knowledge-documents", company?.id],
    queryFn: async () => {
      const res = await api.get(`/companies/${company!.id}/knowledge/documents`);
      return (res as { documents: KnowledgeDocument[] }).documents;
    },
    enabled: !!company?.id,
  });

  const searchMutation = useMutation({
    mutationFn: async (query: string) => {
      const res = await api.post(`/companies/${company!.id}/knowledge/search`, { query, limit: 10 });
      return (res as { results: SearchResult[] }).results;
    },
    onSuccess: (results) => setSearchResults(results),
  });

  const addMutation = useMutation({
    mutationFn: async ({ title, content }: { title: string; content: string }) => {
      return api.post(`/companies/${company!.id}/knowledge/documents`, {
        title,
        content,
        sourceType: "manual",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-documents", company?.id] });
      setNewTitle("");
      setNewContent("");
      setShowAddForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      return api.delete(`/companies/${company!.id}/knowledge/documents/${documentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-documents", company?.id] });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      searchMutation.mutate(searchQuery);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold">Knowledge Base</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Document
        </Button>
      </div>

      <p className="mb-6 text-sm text-muted-foreground">
        Company knowledge documents are automatically chunked, embedded, and searchable by agents.
        Add SOPs, documentation, and institutional knowledge here.
      </p>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search knowledge base..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={searchMutation.isPending || !searchQuery.trim()}>
          {searchMutation.isPending ? "Searching..." : "Search"}
        </Button>
      </form>

      {/* Search Results */}
      {searchResults && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &ldquo;{searchQuery}&rdquo;
          </h2>
          {searchResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No results found.</p>
          ) : (
            <div className="space-y-3">
              {searchResults.map((result) => (
                <div key={result.chunkId} className="rounded-lg border p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-medium">{result.documentTitle ?? "Untitled"}</span>
                    {result.sourcePath && (
                      <span className="text-xs text-muted-foreground">{result.sourcePath}</span>
                    )}
                    <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {result.matchType} &middot; {(result.score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3">{result.content}</p>
                </div>
              ))}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setSearchResults(null)}
          >
            Clear results
          </Button>
        </div>
      )}

      {/* Add Document Form */}
      {showAddForm && (
        <div className="mb-6 rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-medium">Add Knowledge Document</h2>
          <div className="space-y-3">
            <Input
              placeholder="Document title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <textarea
              className="w-full rounded-md border bg-background p-3 text-sm"
              rows={8}
              placeholder="Document content (markdown supported)"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!newTitle.trim() || !newContent.trim() || addMutation.isPending}
                onClick={() => addMutation.mutate({ title: newTitle, content: newContent })}
              >
                {addMutation.isPending ? "Adding..." : "Add Document"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Document List */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          {isLoading ? "Loading..." : `${documents?.length ?? 0} document${(documents?.length ?? 0) !== 1 ? "s" : ""}`}
        </h2>
        {documents && documents.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
            <FileText className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No knowledge documents yet.</p>
            <p className="text-xs text-muted-foreground">
              Add documents manually or sync from a business repo.
            </p>
          </div>
        )}
        {documents && documents.length > 0 && (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{doc.title ?? "Untitled"}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.sourceType}
                      {doc.sourcePath ? ` \u00b7 ${doc.sourcePath}` : ""}
                      {" \u00b7 "}
                      {new Date(doc.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(doc.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
