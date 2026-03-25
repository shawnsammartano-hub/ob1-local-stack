-- Open Brain Database Schema
-- Based on OB1 by Nate B. Jones
-- Supabase + pgvector for semantic search

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create thoughts table
CREATE TABLE thoughts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('action_item', 'decision', 'idea', 'insight', 'note')),
    embedding vector(768),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for vector similarity search
CREATE INDEX thoughts_embedding_idx ON thoughts 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create index for filtering by type
CREATE INDEX thoughts_type_idx ON thoughts(type);

-- Create index for sorting by created_at
CREATE INDEX thoughts_created_at_idx ON thoughts(created_at DESC);

-- Function for semantic search (cosine similarity)
CREATE OR REPLACE FUNCTION match_thoughts(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    type TEXT,
    similarity float,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        thoughts.id,
        thoughts.content,
        thoughts.type,
        1 - (thoughts.embedding <=> query_embedding) AS similarity,
        thoughts.created_at
    FROM thoughts
    WHERE 1 - (thoughts.embedding <=> query_embedding) > match_threshold
    ORDER BY thoughts.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_thoughts_updated_at
    BEFORE UPDATE ON thoughts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust for your Supabase setup)
-- This assumes you're using the anon role for API access
GRANT SELECT, INSERT, UPDATE ON thoughts TO anon;
GRANT EXECUTE ON FUNCTION match_thoughts TO anon;
