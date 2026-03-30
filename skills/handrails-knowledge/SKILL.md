---
name: handrails-knowledge
description: >
  Search and manage the company knowledge base. Use when you need to look up
  SOPs, company documentation, institutional knowledge, or add new knowledge
  documents. The knowledge layer provides hybrid search (semantic + keyword)
  over all company documents.
---

# Handrails Knowledge Skill

You have access to a **company knowledge base** — a searchable collection of documents, SOPs, policies, and institutional knowledge. This knowledge is automatically injected into your context when relevant to your current task, but you can also search and manage it explicitly.

## When to Use This Skill

- You need to look up a company SOP, policy, or procedure
- You want to find documentation about a specific topic
- You need to verify how something should be done per company standards
- You are adding new knowledge (writing an SOP, documenting a process)
- A task references company-specific terminology or processes you don't know

## Searching Knowledge

Search the knowledge base using the API. The search uses hybrid retrieval (semantic similarity + keyword matching) for best results.

```
POST /api/companies/{companyId}/knowledge/search
Headers: Authorization: Bearer $HANDRAILS_API_KEY
{
  "query": "your search query here",
  "limit": 5,
  "scopes": ["sops/", "docs/"]
}
```

**Parameters:**
- `query` (required): Natural language search query. Be specific.
- `limit` (optional): Max results to return. Default 10.
- `scopes` (optional): Filter by source path prefix. Example: `["sops/"]` searches only SOPs.

**Response:** Array of results, each with:
- `content`: The relevant text chunk
- `documentTitle`: Title of the source document
- `sourcePath`: Path in the business repo (e.g., `sops/patient-intake.md`)
- `score`: Relevance score (0-1)
- `matchType`: `"vector"`, `"keyword"`, or `"hybrid"`

### Search Tips

- Use natural language queries, not keywords: "How do we handle patient intake?" works better than "patient intake procedure"
- If results aren't relevant, try rephrasing or narrowing with `scopes`
- Results are ranked by relevance — the first result is usually the best match

## Adding Knowledge

Add a new document to the knowledge base. It will be automatically chunked and indexed.

```
POST /api/companies/{companyId}/knowledge/documents
Headers: Authorization: Bearer $HANDRAILS_API_KEY
{
  "title": "Document Title",
  "content": "Full document content in markdown...",
  "sourceType": "manual"
}
```

**Source types:**
- `"manual"` — created by an agent or human directly
- `"repo"` — synced from the business repo (automatic, don't use this)
- `"upload"` — uploaded file
- `"url"` — fetched from a URL

## Listing Knowledge Documents

```
GET /api/companies/{companyId}/knowledge/documents
Headers: Authorization: Bearer $HANDRAILS_API_KEY
```

Returns all documents with their title, source type, source path, and timestamps.

## Deleting Knowledge

```
DELETE /api/companies/{companyId}/knowledge/documents/{documentId}
Headers: Authorization: Bearer $HANDRAILS_API_KEY
```

## Automatic Knowledge Context

When you receive a task, the Handrails engine automatically searches the knowledge base using the task title and description, then injects relevant chunks into your context under `handrailsKnowledgeContext`. You do NOT need to search manually for every task — check your context first.

Only search explicitly when:
- The automatic context doesn't cover what you need
- You want to search with different terms or scopes
- You need to verify specific details

## Best Practices

1. **Check before you create.** Search before adding a new document — it may already exist.
2. **Write for search.** Use clear headings, specific terminology, and structured content so future searches find your documents.
3. **Keep documents focused.** One SOP per document. One topic per knowledge doc. This improves search precision.
4. **Use markdown.** The chunking system is markdown-aware and will split on headings for better results.
5. **Reference sources.** When writing SOPs or docs, note where the information came from.
