export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      cliente_origem: {
        Row: {
          cliente_id: string
          data_importacao: string
          id: string
          lista: string | null
          observacao: string | null
          organization_id: string
          origem_id: string
        }
        Insert: {
          cliente_id: string
          data_importacao?: string
          id?: string
          lista?: string | null
          observacao?: string | null
          organization_id: string
          origem_id: string
        }
        Update: {
          cliente_id?: string
          data_importacao?: string
          id?: string
          lista?: string | null
          observacao?: string | null
          organization_id?: string
          origem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_origem_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_origem_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_origem_origem_id_fkey"
            columns: ["origem_id"]
            isOneToOne: false
            referencedRelation: "origens"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          cidade: string | null
          cnpj: string | null
          created_at: string
          documento: string | null
          dominio_principal: string | null
          id: string
          nome_fantasia: string | null
          observacoes: string | null
          organization_id: string
          porte: string | null
          razao_social: string
          razao_social_normalizada: string
          segmento_id: string | null
          site: string | null
          status_geral: string
          tipo_documento: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          documento?: string | null
          dominio_principal?: string | null
          id?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          organization_id: string
          porte?: string | null
          razao_social: string
          razao_social_normalizada: string
          segmento_id?: string | null
          site?: string | null
          status_geral?: string
          tipo_documento?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          documento?: string | null
          dominio_principal?: string | null
          id?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          organization_id?: string
          porte?: string | null
          razao_social?: string
          razao_social_normalizada?: string
          segmento_id?: string | null
          site?: string | null
          status_geral?: string
          tipo_documento?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_segmento_id_fkey"
            columns: ["segmento_id"]
            isOneToOne: false
            referencedRelation: "segmentos"
            referencedColumns: ["id"]
          },
        ]
      }
      contatos: {
        Row: {
          area: string | null
          cargo: string | null
          cliente_id: string
          created_at: string
          decisor: boolean
          email: string | null
          email_normalizado: string | null
          id: string
          nivel_influencia: number | null
          nome: string
          organization_id: string
          telefone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          area?: string | null
          cargo?: string | null
          cliente_id: string
          created_at?: string
          decisor?: boolean
          email?: string | null
          email_normalizado?: string | null
          id?: string
          nivel_influencia?: number | null
          nome: string
          organization_id: string
          telefone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          area?: string | null
          cargo?: string | null
          cliente_id?: string
          created_at?: string
          decisor?: boolean
          email?: string | null
          email_normalizado?: string | null
          id?: string
          nivel_influencia?: number | null
          nome?: string
          organization_id?: string
          telefone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contatos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      funil_etapas: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          nome: string
          ordem: number
          organization_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          nome: string
          ordem: number
          organization_id: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          nome?: string
          ordem?: number
          organization_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funil_etapas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      interacoes: {
        Row: {
          anexos: Json | null
          cliente_id: string
          contato_id: string | null
          created_at: string
          data_followup: string | null
          data_interacao: string
          id: string
          oportunidade_id: string | null
          organization_id: string
          proxima_acao: string | null
          resumo: string
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anexos?: Json | null
          cliente_id: string
          contato_id?: string | null
          created_at?: string
          data_followup?: string | null
          data_interacao?: string
          id?: string
          oportunidade_id?: string | null
          organization_id: string
          proxima_acao?: string | null
          resumo: string
          tipo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anexos?: Json | null
          cliente_id?: string
          contato_id?: string | null
          created_at?: string
          data_followup?: string | null
          data_interacao?: string
          id?: string
          oportunidade_id?: string | null
          organization_id?: string
          proxima_acao?: string | null
          resumo?: string
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interacoes_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interacoes_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interacoes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interacoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "pe_users"
            referencedColumns: ["id"]
          },
        ]
      }
      oportunidade_itens: {
        Row: {
          created_at: string
          descricao: string | null
          fornecedor: string | null
          id: string
          oportunidade_id: string
          organization_id: string
          produto_id: string
          produto_nome_snapshot: string | null
          quantidade: number
          status: string
          updated_at: string
          valor_total: number | null
          valor_unitario: number | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          fornecedor?: string | null
          id?: string
          oportunidade_id: string
          organization_id: string
          produto_id: string
          produto_nome_snapshot?: string | null
          quantidade?: number
          status?: string
          updated_at?: string
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          fornecedor?: string | null
          id?: string
          oportunidade_id?: string
          organization_id?: string
          produto_id?: string
          produto_nome_snapshot?: string | null
          quantidade?: number
          status?: string
          updated_at?: string
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "oportunidade_itens_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidade_itens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidade_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      oportunidades: {
        Row: {
          cliente_id: string
          closed_at: string | null
          created_at: string
          created_by_user_id: string
          data_ida: string | null
          data_volta: string | null
          destino: string | null
          etapa_id: string
          etapa_nome_snapshot: string | null
          id: string
          motivo_perda: string | null
          organization_id: string
          owner_user_id: string
          probabilidade: number
          status: string
          titulo: string
          updated_at: string
          valor_total_estimado: number | null
          viajantes_qtd: number | null
        }
        Insert: {
          cliente_id: string
          closed_at?: string | null
          created_at?: string
          created_by_user_id: string
          data_ida?: string | null
          data_volta?: string | null
          destino?: string | null
          etapa_id: string
          etapa_nome_snapshot?: string | null
          id?: string
          motivo_perda?: string | null
          organization_id: string
          owner_user_id: string
          probabilidade?: number
          status?: string
          titulo: string
          updated_at?: string
          valor_total_estimado?: number | null
          viajantes_qtd?: number | null
        }
        Update: {
          cliente_id?: string
          closed_at?: string | null
          created_at?: string
          created_by_user_id?: string
          data_ida?: string | null
          data_volta?: string | null
          destino?: string | null
          etapa_id?: string
          etapa_nome_snapshot?: string | null
          id?: string
          motivo_perda?: string | null
          organization_id?: string
          owner_user_id?: string
          probabilidade?: number
          status?: string
          titulo?: string
          updated_at?: string
          valor_total_estimado?: number | null
          viajantes_qtd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "oportunidades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "pe_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "funil_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "pe_users"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_activities: {
        Row: {
          assunto: string
          concluida: boolean | null
          created_at: string | null
          data_atividade: string | null
          deal_id: string | null
          descricao: string | null
          empresa_id: string | null
          id: string
          prospect_id: string | null
          responsavel_id: string | null
          tipo: string
        }
        Insert: {
          assunto: string
          concluida?: boolean | null
          created_at?: string | null
          data_atividade?: string | null
          deal_id?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          prospect_id?: string | null
          responsavel_id?: string | null
          tipo: string
        }
        Update: {
          assunto?: string
          concluida?: boolean | null
          created_at?: string | null
          data_atividade?: string | null
          deal_id?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          prospect_id?: string | null
          responsavel_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "orbit_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_activities_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_activities_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "orbit_prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_activities_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_advisor_applied_changes: {
        Row: {
          applied_by: string
          created_at: string
          empresa_id: string
          id: string
          rollback_of: string | null
          snapshot_after: Json | null
          snapshot_before: Json | null
          suggestion_id: string | null
          target_id: string | null
          target_kind: string
        }
        Insert: {
          applied_by: string
          created_at?: string
          empresa_id: string
          id?: string
          rollback_of?: string | null
          snapshot_after?: Json | null
          snapshot_before?: Json | null
          suggestion_id?: string | null
          target_id?: string | null
          target_kind: string
        }
        Update: {
          applied_by?: string
          created_at?: string
          empresa_id?: string
          id?: string
          rollback_of?: string | null
          snapshot_after?: Json | null
          snapshot_before?: Json | null
          suggestion_id?: string | null
          target_id?: string | null
          target_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_advisor_applied_changes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_advisor_applied_changes_rollback_of_fkey"
            columns: ["rollback_of"]
            isOneToOne: false
            referencedRelation: "orbit_advisor_applied_changes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_advisor_applied_changes_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "orbit_advisor_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_advisor_messages: {
        Row: {
          content: Json
          created_at: string
          empresa_id: string
          id: string
          role: string
          thread_id: string
          tokens_in: number | null
          tokens_out: number | null
          tool_calls: Json | null
        }
        Insert: {
          content?: Json
          created_at?: string
          empresa_id: string
          id?: string
          role: string
          thread_id: string
          tokens_in?: number | null
          tokens_out?: number | null
          tool_calls?: Json | null
        }
        Update: {
          content?: Json
          created_at?: string
          empresa_id?: string
          id?: string
          role?: string
          thread_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_advisor_messages_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_advisor_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "orbit_advisor_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_advisor_scan_runs: {
        Row: {
          created_at: string
          detector_metrics: Json
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          results: Json
          source: string
          started_at: string
          suggestions_blocked: number
          suggestions_created: number
          suggestions_deduped: number
          suggestions_evaluated: number
          tenants_error: number
          tenants_ok: number
          tenants_total: number
        }
        Insert: {
          created_at?: string
          detector_metrics?: Json
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          results?: Json
          source?: string
          started_at?: string
          suggestions_blocked?: number
          suggestions_created?: number
          suggestions_deduped?: number
          suggestions_evaluated?: number
          tenants_error?: number
          tenants_ok?: number
          tenants_total?: number
        }
        Update: {
          created_at?: string
          detector_metrics?: Json
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          results?: Json
          source?: string
          started_at?: string
          suggestions_blocked?: number
          suggestions_created?: number
          suggestions_deduped?: number
          suggestions_evaluated?: number
          tenants_error?: number
          tenants_ok?: number
          tenants_total?: number
        }
        Relationships: []
      }
      orbit_advisor_snapshots: {
        Row: {
          empresa_id: string
          id: string
          snapshot: Json
          taken_at: string
        }
        Insert: {
          empresa_id: string
          id?: string
          snapshot: Json
          taken_at?: string
        }
        Update: {
          empresa_id?: string
          id?: string
          snapshot?: Json
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_advisor_snapshots_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_advisor_suggestions: {
        Row: {
          action: Json
          applied_change_id: string | null
          blocked_reason: string | null
          criada_por: string
          dedupe_key: string | null
          empresa_id: string
          expires_at: string | null
          gerada_em: string
          id: string
          racional: string | null
          risco: string
          status: string
          tipo: string
          titulo: string
          updated_at: string
          user_confirmed_at: string | null
          user_confirmed_by: string | null
        }
        Insert: {
          action?: Json
          applied_change_id?: string | null
          blocked_reason?: string | null
          criada_por?: string
          dedupe_key?: string | null
          empresa_id: string
          expires_at?: string | null
          gerada_em?: string
          id?: string
          racional?: string | null
          risco?: string
          status?: string
          tipo: string
          titulo: string
          updated_at?: string
          user_confirmed_at?: string | null
          user_confirmed_by?: string | null
        }
        Update: {
          action?: Json
          applied_change_id?: string | null
          blocked_reason?: string | null
          criada_por?: string
          dedupe_key?: string | null
          empresa_id?: string
          expires_at?: string | null
          gerada_em?: string
          id?: string
          racional?: string | null
          risco?: string
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
          user_confirmed_at?: string | null
          user_confirmed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_advisor_suggestions_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_advisor_threads: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          titulo?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_advisor_threads_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_ai_config: {
        Row: {
          advisor_locked_paths: Json
          advisor_playbook_flow_prefixes: string[] | null
          advisor_thresholds: Json
          campos_qualificacao: Json
          created_at: string | null
          empresa_id: string | null
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          idioma: string | null
          knowledge_base_enabled: boolean
          max_tokens: number | null
          mensagem_boas_vindas: string | null
          mensagem_fora_horario: string | null
          modelo_ia: string | null
          modo_automatico: boolean | null
          prompt_identidade: string | null
          prompt_regras: string | null
          prompt_roteiro: string | null
          responder_fora_horario: boolean | null
          tempo_espera: number | null
          tom_conversa: string | null
          tts_api_key: string | null
          tts_ativo: boolean | null
          tts_modo: string | null
          tts_provider: string | null
          tts_voice_id: string | null
          updated_at: string | null
        }
        Insert: {
          advisor_locked_paths?: Json
          advisor_playbook_flow_prefixes?: string[] | null
          advisor_thresholds?: Json
          campos_qualificacao?: Json
          created_at?: string | null
          empresa_id?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          idioma?: string | null
          knowledge_base_enabled?: boolean
          max_tokens?: number | null
          mensagem_boas_vindas?: string | null
          mensagem_fora_horario?: string | null
          modelo_ia?: string | null
          modo_automatico?: boolean | null
          prompt_identidade?: string | null
          prompt_regras?: string | null
          prompt_roteiro?: string | null
          responder_fora_horario?: boolean | null
          tempo_espera?: number | null
          tom_conversa?: string | null
          tts_api_key?: string | null
          tts_ativo?: boolean | null
          tts_modo?: string | null
          tts_provider?: string | null
          tts_voice_id?: string | null
          updated_at?: string | null
        }
        Update: {
          advisor_locked_paths?: Json
          advisor_playbook_flow_prefixes?: string[] | null
          advisor_thresholds?: Json
          campos_qualificacao?: Json
          created_at?: string | null
          empresa_id?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          idioma?: string | null
          knowledge_base_enabled?: boolean
          max_tokens?: number | null
          mensagem_boas_vindas?: string | null
          mensagem_fora_horario?: string | null
          modelo_ia?: string | null
          modo_automatico?: boolean | null
          prompt_identidade?: string | null
          prompt_regras?: string | null
          prompt_roteiro?: string | null
          responder_fora_horario?: boolean | null
          tempo_espera?: number | null
          tom_conversa?: string | null
          tts_api_key?: string | null
          tts_ativo?: boolean | null
          tts_modo?: string | null
          tts_provider?: string | null
          tts_voice_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_ai_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_ai_knowledge: {
        Row: {
          ativo: boolean
          chunk_index: number
          conteudo_texto: string | null
          created_at: string
          embedding: string | null
          empresa_id: string
          erro: string | null
          id: string
          model_version: string
          source_id: string
          source_url: string | null
          status: string
          storage_path: string | null
          tipo: string
          titulo: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          chunk_index?: number
          conteudo_texto?: string | null
          created_at?: string
          embedding?: string | null
          empresa_id: string
          erro?: string | null
          id?: string
          model_version?: string
          source_id?: string
          source_url?: string | null
          status?: string
          storage_path?: string | null
          tipo: string
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          chunk_index?: number
          conteudo_texto?: string | null
          created_at?: string
          embedding?: string | null
          empresa_id?: string
          erro?: string | null
          id?: string
          model_version?: string
          source_id?: string
          source_url?: string | null
          status?: string
          storage_path?: string | null
          tipo?: string
          titulo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_ai_knowledge_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_audio_library: {
        Row: {
          ativo: boolean | null
          contexto: string
          created_at: string | null
          descricao: string | null
          duracao_ms: number | null
          empresa_id: string
          id: string
          nome: string
          storage_path: string | null
          tags: string[] | null
          updated_at: string | null
          url: string
          uso_count: number | null
        }
        Insert: {
          ativo?: boolean | null
          contexto: string
          created_at?: string | null
          descricao?: string | null
          duracao_ms?: number | null
          empresa_id: string
          id?: string
          nome: string
          storage_path?: string | null
          tags?: string[] | null
          updated_at?: string | null
          url: string
          uso_count?: number | null
        }
        Update: {
          ativo?: boolean | null
          contexto?: string
          created_at?: string | null
          descricao?: string | null
          duracao_ms?: number | null
          empresa_id?: string
          id?: string
          nome?: string
          storage_path?: string | null
          tags?: string[] | null
          updated_at?: string | null
          url?: string
          uso_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_audio_library_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_audit_log: {
        Row: {
          acao: string
          created_at: string | null
          detalhes: Json | null
          empresa_id: string | null
          entidade: string
          entidade_id: string | null
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string | null
          detalhes?: Json | null
          empresa_id?: string | null
          entidade: string
          entidade_id?: string | null
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string | null
          detalhes?: Json | null
          empresa_id?: string | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_audit_log_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_campaign_approvals: {
        Row: {
          acao: string
          campaign_id: string | null
          created_at: string | null
          empresa_id: string | null
          id: string
          motivo: string | null
          user_id: string | null
        }
        Insert: {
          acao: string
          campaign_id?: string | null
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          motivo?: string | null
          user_id?: string | null
        }
        Update: {
          acao?: string
          campaign_id?: string | null
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          motivo?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_campaign_approvals_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "orbit_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_campaign_approvals_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_campaign_approvals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_campaign_recipients: {
        Row: {
          bounced_at: string | null
          campaign_id: string | null
          clicked_at: string | null
          complained_at: string | null
          created_at: string | null
          delivered_at: string | null
          email: string | null
          empresa_id: string | null
          engagement_status: string | null
          enviado_em: string | null
          erro: string | null
          id: string
          opened_at: string | null
          prospect_id: string | null
          resend_email_id: string | null
          status: string | null
          telefone: string | null
        }
        Insert: {
          bounced_at?: string | null
          campaign_id?: string | null
          clicked_at?: string | null
          complained_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          email?: string | null
          empresa_id?: string | null
          engagement_status?: string | null
          enviado_em?: string | null
          erro?: string | null
          id?: string
          opened_at?: string | null
          prospect_id?: string | null
          resend_email_id?: string | null
          status?: string | null
          telefone?: string | null
        }
        Update: {
          bounced_at?: string | null
          campaign_id?: string | null
          clicked_at?: string | null
          complained_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          email?: string | null
          empresa_id?: string | null
          engagement_status?: string | null
          enviado_em?: string | null
          erro?: string | null
          id?: string
          opened_at?: string | null
          prospect_id?: string | null
          resend_email_id?: string | null
          status?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "orbit_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_campaign_recipients_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_campaign_recipients_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "orbit_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_campaigns: {
        Row: {
          aberturas: number | null
          agendada_para: string | null
          aprovacao_status: string | null
          aprovado_em: string | null
          aprovado_por: string | null
          canal: string
          cliques: number | null
          created_at: string | null
          created_by: string | null
          empresa_id: string | null
          enviados: number | null
          falhas: number | null
          filtros_json: Json | null
          id: string
          motivo_reprovacao: string | null
          nome: string
          publico_origem: string | null
          respostas: number | null
          status: string | null
          template_id: string | null
          total_destinatarios: number | null
          updated_at: string | null
          whatsapp_cta_enabled: boolean | null
          whatsapp_cta_mensagem_inicial: string | null
          whatsapp_cta_numero: string | null
          whatsapp_cta_override: boolean | null
          whatsapp_cta_posicao: string | null
          whatsapp_cta_texto_botao: string | null
        }
        Insert: {
          aberturas?: number | null
          agendada_para?: string | null
          aprovacao_status?: string | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          canal: string
          cliques?: number | null
          created_at?: string | null
          created_by?: string | null
          empresa_id?: string | null
          enviados?: number | null
          falhas?: number | null
          filtros_json?: Json | null
          id?: string
          motivo_reprovacao?: string | null
          nome: string
          publico_origem?: string | null
          respostas?: number | null
          status?: string | null
          template_id?: string | null
          total_destinatarios?: number | null
          updated_at?: string | null
          whatsapp_cta_enabled?: boolean | null
          whatsapp_cta_mensagem_inicial?: string | null
          whatsapp_cta_numero?: string | null
          whatsapp_cta_override?: boolean | null
          whatsapp_cta_posicao?: string | null
          whatsapp_cta_texto_botao?: string | null
        }
        Update: {
          aberturas?: number | null
          agendada_para?: string | null
          aprovacao_status?: string | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          canal?: string
          cliques?: number | null
          created_at?: string | null
          created_by?: string | null
          empresa_id?: string | null
          enviados?: number | null
          falhas?: number | null
          filtros_json?: Json | null
          id?: string
          motivo_reprovacao?: string | null
          nome?: string
          publico_origem?: string | null
          respostas?: number | null
          status?: string | null
          template_id?: string | null
          total_destinatarios?: number | null
          updated_at?: string | null
          whatsapp_cta_enabled?: boolean | null
          whatsapp_cta_mensagem_inicial?: string | null
          whatsapp_cta_numero?: string | null
          whatsapp_cta_override?: boolean | null
          whatsapp_cta_posicao?: string | null
          whatsapp_cta_texto_botao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_campaigns_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_campaigns_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "orbit_message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_chatbot_flow_branches: {
        Row: {
          created_at: string | null
          encerrar_fluxo: boolean | null
          flow_id: string
          id: string
          keywords: string[] | null
          nome: string | null
          ordem: number | null
          resposta_audio_id: string | null
          resposta_texto: string | null
        }
        Insert: {
          created_at?: string | null
          encerrar_fluxo?: boolean | null
          flow_id: string
          id?: string
          keywords?: string[] | null
          nome?: string | null
          ordem?: number | null
          resposta_audio_id?: string | null
          resposta_texto?: string | null
        }
        Update: {
          created_at?: string | null
          encerrar_fluxo?: boolean | null
          flow_id?: string
          id?: string
          keywords?: string[] | null
          nome?: string | null
          ordem?: number | null
          resposta_audio_id?: string | null
          resposta_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_chatbot_flow_branches_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "orbit_chatbot_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_chatbot_flow_branches_resposta_audio_id_fkey"
            columns: ["resposta_audio_id"]
            isOneToOne: false
            referencedRelation: "orbit_audio_library"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_chatbot_flows: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          descricao: string | null
          empresa_id: string
          id: string
          nome: string
          passo1_aguardar_resposta: boolean | null
          passo1_audio_id: string | null
          passo1_texto: string | null
          prioridade: number | null
          trigger_keywords: string[]
          trigger_modo: string | null
          updated_at: string | null
          uso_count: number | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          empresa_id: string
          id?: string
          nome: string
          passo1_aguardar_resposta?: boolean | null
          passo1_audio_id?: string | null
          passo1_texto?: string | null
          prioridade?: number | null
          trigger_keywords?: string[]
          trigger_modo?: string | null
          updated_at?: string | null
          uso_count?: number | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          empresa_id?: string
          id?: string
          nome?: string
          passo1_aguardar_resposta?: boolean | null
          passo1_audio_id?: string | null
          passo1_texto?: string | null
          prioridade?: number | null
          trigger_keywords?: string[]
          trigger_modo?: string | null
          updated_at?: string | null
          uso_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_chatbot_flows_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_chatbot_flows_passo1_audio_id_fkey"
            columns: ["passo1_audio_id"]
            isOneToOne: false
            referencedRelation: "orbit_audio_library"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_client_onboardings: {
        Row: {
          archived: boolean
          cliente_email: string | null
          cliente_empresa: string | null
          cliente_nome: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          empresa_id: string
          id: string
          implementation_checklist: Json
          last_saved_at: string | null
          notes: string | null
          public_token: string
          responses: Json
          sent_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["orbit_onboarding_status"]
          updated_at: string
        }
        Insert: {
          archived?: boolean
          cliente_email?: string | null
          cliente_empresa?: string | null
          cliente_nome?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id: string
          id?: string
          implementation_checklist?: Json
          last_saved_at?: string | null
          notes?: string | null
          public_token?: string
          responses?: Json
          sent_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["orbit_onboarding_status"]
          updated_at?: string
        }
        Update: {
          archived?: boolean
          cliente_email?: string | null
          cliente_empresa?: string | null
          cliente_nome?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          id?: string
          implementation_checklist?: Json
          last_saved_at?: string | null
          notes?: string | null
          public_token?: string
          responses?: Json
          sent_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["orbit_onboarding_status"]
          updated_at?: string
        }
        Relationships: []
      }
      orbit_conversas: {
        Row: {
          ai_contexto: Json | null
          ai_processing: boolean | null
          canal: string | null
          chatbot_aguardando: boolean | null
          chatbot_flow_id: string | null
          created_at: string | null
          empresa_id: string | null
          handoff_sent_at: string | null
          human_talk: boolean | null
          human_user_id: string | null
          id: string
          mensagens_nao_lidas: number | null
          prospect_id: string | null
          status: string | null
          telefone_whatsapp: string
          ultima_mensagem_at: string | null
          ultima_mensagem_preview: string | null
          updated_at: string | null
        }
        Insert: {
          ai_contexto?: Json | null
          ai_processing?: boolean | null
          canal?: string | null
          chatbot_aguardando?: boolean | null
          chatbot_flow_id?: string | null
          created_at?: string | null
          empresa_id?: string | null
          handoff_sent_at?: string | null
          human_talk?: boolean | null
          human_user_id?: string | null
          id?: string
          mensagens_nao_lidas?: number | null
          prospect_id?: string | null
          status?: string | null
          telefone_whatsapp: string
          ultima_mensagem_at?: string | null
          ultima_mensagem_preview?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_contexto?: Json | null
          ai_processing?: boolean | null
          canal?: string | null
          chatbot_aguardando?: boolean | null
          chatbot_flow_id?: string | null
          created_at?: string | null
          empresa_id?: string | null
          handoff_sent_at?: string | null
          human_talk?: boolean | null
          human_user_id?: string | null
          id?: string
          mensagens_nao_lidas?: number | null
          prospect_id?: string | null
          status?: string | null
          telefone_whatsapp?: string
          ultima_mensagem_at?: string | null
          ultima_mensagem_preview?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_conversas_chatbot_flow_id_fkey"
            columns: ["chatbot_flow_id"]
            isOneToOne: false
            referencedRelation: "orbit_chatbot_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_conversas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_conversas_human_user_id_fkey"
            columns: ["human_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_conversas_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "orbit_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_deals: {
        Row: {
          created_at: string | null
          data_conversao: string | null
          data_prevista_fechamento: string | null
          deleted_at: string | null
          documentos_checklist: Json | null
          empresa_id: string | null
          etapa_id: string | null
          id: string
          motivo_perda: string | null
          moved_at: string | null
          origem: string
          probabilidade: number | null
          prospect_id: string | null
          responsavel_id: string | null
          status: string
          titulo: string
          ultima_interacao_at: string | null
          updated_at: string | null
          valor_estimado: number | null
        }
        Insert: {
          created_at?: string | null
          data_conversao?: string | null
          data_prevista_fechamento?: string | null
          deleted_at?: string | null
          documentos_checklist?: Json | null
          empresa_id?: string | null
          etapa_id?: string | null
          id?: string
          motivo_perda?: string | null
          moved_at?: string | null
          origem?: string
          probabilidade?: number | null
          prospect_id?: string | null
          responsavel_id?: string | null
          status?: string
          titulo: string
          ultima_interacao_at?: string | null
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Update: {
          created_at?: string | null
          data_conversao?: string | null
          data_prevista_fechamento?: string | null
          deleted_at?: string | null
          documentos_checklist?: Json | null
          empresa_id?: string | null
          etapa_id?: string | null
          id?: string
          motivo_perda?: string | null
          moved_at?: string | null
          origem?: string
          probabilidade?: number | null
          prospect_id?: string | null
          responsavel_id?: string | null
          status?: string
          titulo?: string
          ultima_interacao_at?: string | null
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_deals_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_deals_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "orbit_pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_deals_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "orbit_prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_deals_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_distribuicao_config: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          empresa_id: string | null
          id: string
          ordem_fila: number | null
          total_atribuicoes: number | null
          ultima_atribuicao: string | null
          vendedor_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          ordem_fila?: number | null
          total_atribuicoes?: number | null
          ultima_atribuicao?: string | null
          vendedor_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          ordem_fila?: number | null
          total_atribuicoes?: number | null
          ultima_atribuicao?: string | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_distribuicao_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_distribuicao_config_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_email_events: {
        Row: {
          canal: string
          created_at: string | null
          empresa_id: string | null
          event_type: string
          id: string
          ip_address: string | null
          raw_payload: Json | null
          recipient_id: string | null
          resend_email_id: string | null
          url: string | null
          user_agent: string | null
        }
        Insert: {
          canal?: string
          created_at?: string | null
          empresa_id?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          raw_payload?: Json | null
          recipient_id?: string | null
          resend_email_id?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          canal?: string
          created_at?: string | null
          empresa_id?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          raw_payload?: Json | null
          recipient_id?: string | null
          resend_email_id?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_email_events_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_email_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "orbit_campaign_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_empresas: {
        Row: {
          ativo: boolean | null
          cnpj: string | null
          cnpj_normalized: string | null
          created_at: string | null
          data_expiracao: string | null
          email_contato: string | null
          id: string
          logo_url: string | null
          max_usuarios: number | null
          nome: string
          plano: string | null
          public_url: string | null
          slug: string | null
          slug_created_at: string | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          cnpj?: string | null
          cnpj_normalized?: string | null
          created_at?: string | null
          data_expiracao?: string | null
          email_contato?: string | null
          id?: string
          logo_url?: string | null
          max_usuarios?: number | null
          nome: string
          plano?: string | null
          public_url?: string | null
          slug?: string | null
          slug_created_at?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          cnpj?: string | null
          cnpj_normalized?: string | null
          created_at?: string | null
          data_expiracao?: string | null
          email_contato?: string | null
          id?: string
          logo_url?: string | null
          max_usuarios?: number | null
          nome?: string
          plano?: string | null
          public_url?: string | null
          slug?: string | null
          slug_created_at?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      orbit_flow_actions: {
        Row: {
          action_config: Json
          action_type: Database["public"]["Enums"]["orbit_flow_action_type"]
          created_at: string
          delay_seconds: number
          flow_id: string
          id: string
          ordem: number
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: Database["public"]["Enums"]["orbit_flow_action_type"]
          created_at?: string
          delay_seconds?: number
          flow_id: string
          id?: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: Database["public"]["Enums"]["orbit_flow_action_type"]
          created_at?: string
          delay_seconds?: number
          flow_id?: string
          id?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_flow_actions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "orbit_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_flow_events: {
        Row: {
          created_at: string
          dedupe_key: string | null
          empresa_id: string
          entity_id: string | null
          entity_type: string
          event_type: Database["public"]["Enums"]["orbit_flow_trigger_type"]
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          empresa_id: string
          entity_id?: string | null
          entity_type: string
          event_type: Database["public"]["Enums"]["orbit_flow_trigger_type"]
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          empresa_id?: string
          entity_id?: string | null
          entity_type?: string
          event_type?: Database["public"]["Enums"]["orbit_flow_trigger_type"]
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_flow_events_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_flow_run_steps: {
        Row: {
          action_id: string | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          ordem: number
          output: Json | null
          run_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["orbit_flow_run_status"]
        }
        Insert: {
          action_id?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          ordem?: number
          output?: Json | null
          run_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["orbit_flow_run_status"]
        }
        Update: {
          action_id?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          ordem?: number
          output?: Json | null
          run_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["orbit_flow_run_status"]
        }
        Relationships: [
          {
            foreignKeyName: "orbit_flow_run_steps_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "orbit_flow_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_flow_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "orbit_flow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_flow_runs: {
        Row: {
          context: Json
          created_at: string
          empresa_id: string
          entity_id: string | null
          entity_type: string | null
          error: string | null
          event_id: string | null
          finished_at: string | null
          flow_id: string
          id: string
          started_at: string | null
          status: Database["public"]["Enums"]["orbit_flow_run_status"]
          updated_at: string
        }
        Insert: {
          context?: Json
          created_at?: string
          empresa_id: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          event_id?: string | null
          finished_at?: string | null
          flow_id: string
          id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["orbit_flow_run_status"]
          updated_at?: string
        }
        Update: {
          context?: Json
          created_at?: string
          empresa_id?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          event_id?: string | null
          finished_at?: string | null
          flow_id?: string
          id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["orbit_flow_run_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_flow_runs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "orbit_flow_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_flow_runs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "orbit_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_flow_scheduled_actions: {
        Row: {
          action_config: Json
          action_id: string | null
          action_type: string
          attempts: number
          canceled_reason: string | null
          context: Json
          created_at: string
          deal_id: string | null
          empresa_id: string
          flow_id: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          ordem: number
          prospect_id: string | null
          run_id: string
          scheduled_for: string
          status: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_id?: string | null
          action_type: string
          attempts?: number
          canceled_reason?: string | null
          context?: Json
          created_at?: string
          deal_id?: string | null
          empresa_id: string
          flow_id: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          ordem?: number
          prospect_id?: string | null
          run_id: string
          scheduled_for: string
          status?: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_id?: string | null
          action_type?: string
          attempts?: number
          canceled_reason?: string | null
          context?: Json
          created_at?: string
          deal_id?: string | null
          empresa_id?: string
          flow_id?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          ordem?: number
          prospect_id?: string | null
          run_id?: string
          scheduled_for?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_flow_scheduled_actions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "orbit_flow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_flow_templates: {
        Row: {
          ativo: boolean
          categoria: string | null
          created_at: string
          criado_por_advisor: boolean
          definicao: Json
          descricao: string | null
          id: string
          is_global: boolean
          is_official: boolean
          nome: string
          source_flow_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          criado_por_advisor?: boolean
          definicao?: Json
          descricao?: string | null
          id?: string
          is_global?: boolean
          is_official?: boolean
          nome: string
          source_flow_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          criado_por_advisor?: boolean
          definicao?: Json
          descricao?: string | null
          id?: string
          is_global?: boolean
          is_official?: boolean
          nome?: string
          source_flow_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_flow_templates_source_flow_id_fkey"
            columns: ["source_flow_id"]
            isOneToOne: false
            referencedRelation: "orbit_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_flows: {
        Row: {
          ativo: boolean
          condicoes: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          descricao: string | null
          empresa_id: string
          id: string
          nome: string
          template_id: string | null
          trigger_config: Json
          trigger_type: Database["public"]["Enums"]["orbit_flow_trigger_type"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          condicoes?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          descricao?: string | null
          empresa_id: string
          id?: string
          nome: string
          template_id?: string | null
          trigger_config?: Json
          trigger_type: Database["public"]["Enums"]["orbit_flow_trigger_type"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          condicoes?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          descricao?: string | null
          empresa_id?: string
          id?: string
          nome?: string
          template_id?: string | null
          trigger_config?: Json
          trigger_type?: Database["public"]["Enums"]["orbit_flow_trigger_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_flows_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_flows_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "orbit_flow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_google_oauth_states: {
        Row: {
          created_at: string
          empresa_id: string
          expires_at: string
          redirect_after: string | null
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          expires_at?: string
          redirect_after?: string | null
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          expires_at?: string
          redirect_after?: string | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      orbit_google_tokens: {
        Row: {
          access_token: string
          calendar_id: string
          created_at: string
          empresa_id: string
          expires_at: string
          google_email: string | null
          id: string
          refresh_token: string
          scope: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          calendar_id?: string
          created_at?: string
          empresa_id: string
          expires_at: string
          google_email?: string | null
          id?: string
          refresh_token: string
          scope?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          calendar_id?: string
          created_at?: string
          empresa_id?: string
          expires_at?: string
          google_email?: string | null
          id?: string
          refresh_token?: string
          scope?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_google_tokens_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_handoffs: {
        Row: {
          conversa_id: string
          created_at: string | null
          empresa_id: string | null
          id: string
          prospect_id: string | null
          resumo: string | null
          sent_at: string | null
          status: string
          vendedor_id: string | null
        }
        Insert: {
          conversa_id: string
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          prospect_id?: string | null
          resumo?: string | null
          sent_at?: string | null
          status?: string
          vendedor_id?: string | null
        }
        Update: {
          conversa_id?: string
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          prospect_id?: string | null
          resumo?: string | null
          sent_at?: string | null
          status?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_handoffs_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "orbit_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_handoffs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_handoffs_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "orbit_prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_handoffs_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_import_history: {
        Row: {
          arquivo_nome: string
          created_at: string | null
          detalhes_erros: Json | null
          empresa_id: string | null
          erros: number | null
          id: string
          importado_por: string | null
          sucesso: number | null
          total_registros: number | null
        }
        Insert: {
          arquivo_nome: string
          created_at?: string | null
          detalhes_erros?: Json | null
          empresa_id?: string | null
          erros?: number | null
          id?: string
          importado_por?: string | null
          sucesso?: number | null
          total_registros?: number | null
        }
        Update: {
          arquivo_nome?: string
          created_at?: string | null
          detalhes_erros?: Json | null
          empresa_id?: string | null
          erros?: number | null
          id?: string
          importado_por?: string | null
          sucesso?: number | null
          total_registros?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_import_history_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_import_history_importado_por_fkey"
            columns: ["importado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_integrations_config: {
        Row: {
          ativo: boolean | null
          config_json: Json | null
          created_at: string | null
          empresa_id: string | null
          id: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          config_json?: Json | null
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          tipo: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          config_json?: Json | null
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_integrations_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_lead_score_config: {
        Row: {
          created_at: string
          empresa_id: string
          enabled: boolean
          id: string
          rules: Json
          thresholds: Json
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          empresa_id: string
          enabled?: boolean
          id?: string
          rules?: Json
          thresholds?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          empresa_id?: string
          enabled?: boolean
          id?: string
          rules?: Json
          thresholds?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "orbit_lead_score_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_lead_sources: {
        Row: {
          ativo: boolean
          config: Json
          created_at: string
          empresa_id: string
          field_mapping: Json
          id: string
          last_received_at: string | null
          nome: string
          secret_token: string
          tipo: string
          total_received: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          config?: Json
          created_at?: string
          empresa_id: string
          field_mapping?: Json
          id?: string
          last_received_at?: string | null
          nome: string
          secret_token?: string
          tipo: string
          total_received?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          config?: Json
          created_at?: string
          empresa_id?: string
          field_mapping?: Json
          id?: string
          last_received_at?: string | null
          nome?: string
          secret_token?: string
          tipo?: string
          total_received?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_lead_sources_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_meetings: {
        Row: {
          conversa_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          descricao: string | null
          duration_minutes: number
          empresa_id: string
          google_event_id: string | null
          id: string
          location: string | null
          meeting_url: string | null
          metadata: Json
          prospect_id: string | null
          scheduled_at: string
          status: string
          titulo: string | null
          updated_at: string
        }
        Insert: {
          conversa_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          descricao?: string | null
          duration_minutes?: number
          empresa_id: string
          google_event_id?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          metadata?: Json
          prospect_id?: string | null
          scheduled_at: string
          status?: string
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          conversa_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          descricao?: string | null
          duration_minutes?: number
          empresa_id?: string
          google_event_id?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          metadata?: Json
          prospect_id?: string | null
          scheduled_at?: string
          status?: string
          titulo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_meetings_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "orbit_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_meetings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "orbit_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_meetings_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_meetings_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "orbit_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_mensagens: {
        Row: {
          campaign_id: string | null
          canal: string | null
          conversa_id: string | null
          direcao: string
          empresa_id: string | null
          erro: string | null
          id: string
          mensagem: string | null
          provider_message_id: string | null
          status: string | null
          storage_path: string | null
          timestamp: string | null
          tipo_midia: string | null
          url_midia: string | null
        }
        Insert: {
          campaign_id?: string | null
          canal?: string | null
          conversa_id?: string | null
          direcao: string
          empresa_id?: string | null
          erro?: string | null
          id?: string
          mensagem?: string | null
          provider_message_id?: string | null
          status?: string | null
          storage_path?: string | null
          timestamp?: string | null
          tipo_midia?: string | null
          url_midia?: string | null
        }
        Update: {
          campaign_id?: string | null
          canal?: string | null
          conversa_id?: string | null
          direcao?: string
          empresa_id?: string | null
          erro?: string | null
          id?: string
          mensagem?: string | null
          provider_message_id?: string | null
          status?: string | null
          storage_path?: string | null
          timestamp?: string | null
          tipo_midia?: string | null
          url_midia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_mensagens_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "orbit_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "orbit_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_mensagens_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_message_templates: {
        Row: {
          assunto_email: string | null
          ativo: boolean | null
          canal: string
          categoria: string | null
          corpo_html: string | null
          corpo_texto: string | null
          created_at: string | null
          empresa_id: string | null
          id: string
          imagem_url: string | null
          nome: string
          updated_at: string | null
          variaveis: string[] | null
          whatsapp_cta_enabled: boolean | null
          whatsapp_cta_mensagem_inicial: string | null
          whatsapp_cta_numero: string | null
          whatsapp_cta_posicao: string | null
          whatsapp_cta_texto_botao: string | null
        }
        Insert: {
          assunto_email?: string | null
          ativo?: boolean | null
          canal: string
          categoria?: string | null
          corpo_html?: string | null
          corpo_texto?: string | null
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          imagem_url?: string | null
          nome: string
          updated_at?: string | null
          variaveis?: string[] | null
          whatsapp_cta_enabled?: boolean | null
          whatsapp_cta_mensagem_inicial?: string | null
          whatsapp_cta_numero?: string | null
          whatsapp_cta_posicao?: string | null
          whatsapp_cta_texto_botao?: string | null
        }
        Update: {
          assunto_email?: string | null
          ativo?: boolean | null
          canal?: string
          categoria?: string | null
          corpo_html?: string | null
          corpo_texto?: string | null
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          imagem_url?: string | null
          nome?: string
          updated_at?: string | null
          variaveis?: string[] | null
          whatsapp_cta_enabled?: boolean | null
          whatsapp_cta_mensagem_inicial?: string | null
          whatsapp_cta_numero?: string | null
          whatsapp_cta_posicao?: string | null
          whatsapp_cta_texto_botao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_message_templates_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_meta_config: {
        Row: {
          access_token: string | null
          ativo: boolean | null
          created_at: string | null
          empresa_id: string | null
          facebook_page_id: string | null
          id: string
          instagram_business_id: string | null
          updated_at: string | null
          webhook_verify_token: string | null
        }
        Insert: {
          access_token?: string | null
          ativo?: boolean | null
          created_at?: string | null
          empresa_id?: string | null
          facebook_page_id?: string | null
          id?: string
          instagram_business_id?: string | null
          updated_at?: string | null
          webhook_verify_token?: string | null
        }
        Update: {
          access_token?: string | null
          ativo?: boolean | null
          created_at?: string | null
          empresa_id?: string | null
          facebook_page_id?: string | null
          id?: string
          instagram_business_id?: string | null
          updated_at?: string | null
          webhook_verify_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_meta_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_pe_links: {
        Row: {
          cliente_id: string | null
          contato_id: string | null
          created_at: string
          empresa_id: string
          id: string
          is_primary: boolean
          match_confidence: number
          match_type: string
          oportunidade_id: string | null
          organization_id: string
          prospect_id: string
          updated_at: string
        }
        Insert: {
          cliente_id?: string | null
          contato_id?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          is_primary?: boolean
          match_confidence?: number
          match_type?: string
          oportunidade_id?: string | null
          organization_id: string
          prospect_id: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string | null
          contato_id?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          is_primary?: boolean
          match_confidence?: number
          match_type?: string
          oportunidade_id?: string | null
          organization_id?: string
          prospect_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      orbit_pipeline_stages: {
        Row: {
          ai_config: Json | null
          automacoes_config: Json
          cor: string | null
          created_at: string | null
          descricao: string | null
          empresa_id: string
          id: string
          is_archived: boolean
          is_lost: boolean | null
          is_won: boolean | null
          nome: string
          ordem: number
          probabilidade_default: number | null
          requer_motivo: boolean
          sla_dias: number | null
          slug: string | null
          updated_at: string
        }
        Insert: {
          ai_config?: Json | null
          automacoes_config?: Json
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          empresa_id: string
          id?: string
          is_archived?: boolean
          is_lost?: boolean | null
          is_won?: boolean | null
          nome: string
          ordem: number
          probabilidade_default?: number | null
          requer_motivo?: boolean
          sla_dias?: number | null
          slug?: string | null
          updated_at?: string
        }
        Update: {
          ai_config?: Json | null
          automacoes_config?: Json
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          empresa_id?: string
          id?: string
          is_archived?: boolean
          is_lost?: boolean | null
          is_won?: boolean | null
          nome?: string
          ordem?: number
          probabilidade_default?: number | null
          requer_motivo?: boolean
          sla_dias?: number | null
          slug?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_pipeline_stages_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_pipeline_templates: {
        Row: {
          created_at: string
          descricao: string | null
          empresa_id: string | null
          id: string
          is_system: boolean
          nome: string
          stages: Json
          updated_at: string
          vertical: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          is_system?: boolean
          nome: string
          stages?: Json
          updated_at?: string
          vertical?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          is_system?: boolean
          nome?: string
          stages?: Json
          updated_at?: string
          vertical?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_pipeline_templates_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_prospects: {
        Row: {
          cidade: string | null
          cnpj_cpf: string | null
          consentimento_email: boolean | null
          consentimento_whatsapp: boolean | null
          created_at: string | null
          dados_adicionais: Json
          deleted_at: string | null
          email_principal: string | null
          empresa_id: string | null
          estado: string | null
          id: string
          lead_score_label: string | null
          lead_score_reasons: Json | null
          lead_score_updated_at: string | null
          lead_score_version: number | null
          nome_contato: string | null
          nome_fantasia: string | null
          nome_razao: string
          observacoes: string | null
          optout_email: boolean | null
          optout_whatsapp: boolean | null
          origem_contato: string | null
          origem_lead: string | null
          responsavel_id: string | null
          score: number | null
          segmento: string | null
          status_qualificacao: string | null
          tags: string[] | null
          telefone: string | null
          tipo: string | null
          tipo_documento: string | null
          updated_at: string | null
          whatsapp: string | null
          whatsapp_last_check_at: string | null
          whatsapp_status: string
        }
        Insert: {
          cidade?: string | null
          cnpj_cpf?: string | null
          consentimento_email?: boolean | null
          consentimento_whatsapp?: boolean | null
          created_at?: string | null
          dados_adicionais?: Json
          deleted_at?: string | null
          email_principal?: string | null
          empresa_id?: string | null
          estado?: string | null
          id?: string
          lead_score_label?: string | null
          lead_score_reasons?: Json | null
          lead_score_updated_at?: string | null
          lead_score_version?: number | null
          nome_contato?: string | null
          nome_fantasia?: string | null
          nome_razao: string
          observacoes?: string | null
          optout_email?: boolean | null
          optout_whatsapp?: boolean | null
          origem_contato?: string | null
          origem_lead?: string | null
          responsavel_id?: string | null
          score?: number | null
          segmento?: string | null
          status_qualificacao?: string | null
          tags?: string[] | null
          telefone?: string | null
          tipo?: string | null
          tipo_documento?: string | null
          updated_at?: string | null
          whatsapp?: string | null
          whatsapp_last_check_at?: string | null
          whatsapp_status?: string
        }
        Update: {
          cidade?: string | null
          cnpj_cpf?: string | null
          consentimento_email?: boolean | null
          consentimento_whatsapp?: boolean | null
          created_at?: string | null
          dados_adicionais?: Json
          deleted_at?: string | null
          email_principal?: string | null
          empresa_id?: string | null
          estado?: string | null
          id?: string
          lead_score_label?: string | null
          lead_score_reasons?: Json | null
          lead_score_updated_at?: string | null
          lead_score_version?: number | null
          nome_contato?: string | null
          nome_fantasia?: string | null
          nome_razao?: string
          observacoes?: string | null
          optout_email?: boolean | null
          optout_whatsapp?: boolean | null
          origem_contato?: string | null
          origem_lead?: string | null
          responsavel_id?: string | null
          score?: number | null
          segmento?: string | null
          status_qualificacao?: string | null
          tags?: string[] | null
          telefone?: string | null
          tipo?: string | null
          tipo_documento?: string | null
          updated_at?: string | null
          whatsapp?: string | null
          whatsapp_last_check_at?: string | null
          whatsapp_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_prospects_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_prospects_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_resend_config: {
        Row: {
          api_key: string | null
          ativo: boolean | null
          created_at: string | null
          dominio_verificado: string | null
          email_teste: string | null
          empresa_id: string | null
          from_email: string | null
          from_name: string | null
          id: string
          reply_to_email: string | null
          updated_at: string | null
        }
        Insert: {
          api_key?: string | null
          ativo?: boolean | null
          created_at?: string | null
          dominio_verificado?: string | null
          email_teste?: string | null
          empresa_id?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          reply_to_email?: string | null
          updated_at?: string | null
        }
        Update: {
          api_key?: string | null
          ativo?: boolean | null
          created_at?: string | null
          dominio_verificado?: string | null
          email_teste?: string | null
          empresa_id?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          reply_to_email?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_resend_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_send_groups: {
        Row: {
          created_at: string | null
          created_by: string | null
          descricao: string | null
          empresa_id: string
          id: string
          nome: string
          prospect_ids: string[]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          descricao?: string | null
          empresa_id: string
          id?: string
          nome: string
          prospect_ids?: string[]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          descricao?: string | null
          empresa_id?: string
          id?: string
          nome?: string
          prospect_ids?: string[]
          updated_at?: string | null
        }
        Relationships: []
      }
      orbit_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          descricao: string | null
          due_date: string | null
          due_time: string | null
          empresa_id: string
          id: string
          notificar_responsavel: boolean | null
          prioridade: string
          prospect_id: string | null
          status: string
          tipo_tarefa: string
          titulo: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          descricao?: string | null
          due_date?: string | null
          due_time?: string | null
          empresa_id: string
          id?: string
          notificar_responsavel?: boolean | null
          prioridade?: string
          prospect_id?: string | null
          status?: string
          tipo_tarefa?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          descricao?: string | null
          due_date?: string | null
          due_time?: string | null
          empresa_id?: string
          id?: string
          notificar_responsavel?: boolean | null
          prioridade?: string
          prospect_id?: string | null
          status?: string
          tipo_tarefa?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "orbit_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_tasks_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "orbit_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_transferencias: {
        Row: {
          created_at: string | null
          de_vendedor_id: string | null
          empresa_id: string | null
          id: string
          motivo: string | null
          notificacao_enviada: boolean | null
          para_vendedor_id: string | null
          prospect_id: string | null
        }
        Insert: {
          created_at?: string | null
          de_vendedor_id?: string | null
          empresa_id?: string | null
          id?: string
          motivo?: string | null
          notificacao_enviada?: boolean | null
          para_vendedor_id?: string | null
          prospect_id?: string | null
        }
        Update: {
          created_at?: string | null
          de_vendedor_id?: string | null
          empresa_id?: string | null
          id?: string
          motivo?: string | null
          notificacao_enviada?: boolean | null
          para_vendedor_id?: string | null
          prospect_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_transferencias_de_vendedor_id_fkey"
            columns: ["de_vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_transferencias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_transferencias_para_vendedor_id_fkey"
            columns: ["para_vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_transferencias_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "orbit_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_webhook_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          id: string
          instance_id: string | null
          payload: Json | null
          phone: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          instance_id?: string | null
          payload?: Json | null
          phone?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          instance_id?: string | null
          payload?: Json | null
          phone?: string | null
          status?: string | null
        }
        Relationships: []
      }
      orbit_whatsapp_daily_limits: {
        Row: {
          created_at: string | null
          data: string
          empresa_id: string | null
          id: string
          limite_diario: number | null
          mensagens_enviadas: number | null
        }
        Insert: {
          created_at?: string | null
          data?: string
          empresa_id?: string | null
          id?: string
          limite_diario?: number | null
          mensagens_enviadas?: number | null
        }
        Update: {
          created_at?: string | null
          data?: string
          empresa_id?: string | null
          id?: string
          limite_diario?: number | null
          mensagens_enviadas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_whatsapp_daily_limits_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_whatsapp_daily_usage: {
        Row: {
          empresa_id: string
          id: string
          sent_count: number
          updated_at: string | null
          usage_date: string
        }
        Insert: {
          empresa_id: string
          id?: string
          sent_count?: number
          updated_at?: string | null
          usage_date?: string
        }
        Update: {
          empresa_id?: string
          id?: string
          sent_count?: number
          updated_at?: string | null
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_whatsapp_daily_usage_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_whatsapp_sending_config: {
        Row: {
          batch_pause_ms: number
          batch_size: number
          created_at: string | null
          daily_limit: number
          empresa_id: string | null
          enabled: boolean
          id: string
          max_delay_ms: number
          max_per_minute: number
          min_delay_ms: number
          updated_at: string | null
          warmup_enabled: boolean
          warmup_start_date: string | null
        }
        Insert: {
          batch_pause_ms?: number
          batch_size?: number
          created_at?: string | null
          daily_limit?: number
          empresa_id?: string | null
          enabled?: boolean
          id?: string
          max_delay_ms?: number
          max_per_minute?: number
          min_delay_ms?: number
          updated_at?: string | null
          warmup_enabled?: boolean
          warmup_start_date?: string | null
        }
        Update: {
          batch_pause_ms?: number
          batch_size?: number
          created_at?: string | null
          daily_limit?: number
          empresa_id?: string | null
          enabled?: boolean
          id?: string
          max_delay_ms?: number
          max_per_minute?: number
          min_delay_ms?: number
          updated_at?: string | null
          warmup_enabled?: boolean
          warmup_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_whatsapp_sending_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_zapi_config: {
        Row: {
          ativo: boolean | null
          client_token: string | null
          client_token_secret_id: string | null
          created_at: string | null
          empresa_id: string | null
          envio_real_liberado: boolean
          id: string
          instance_id: string | null
          nome_instancia: string | null
          notificar_enviadas_por_mim: boolean | null
          numero_origem: string | null
          token: string | null
          token_secret_id: string | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          ativo?: boolean | null
          client_token?: string | null
          client_token_secret_id?: string | null
          created_at?: string | null
          empresa_id?: string | null
          envio_real_liberado?: boolean
          id?: string
          instance_id?: string | null
          nome_instancia?: string | null
          notificar_enviadas_por_mim?: boolean | null
          numero_origem?: string | null
          token?: string | null
          token_secret_id?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          ativo?: boolean | null
          client_token?: string | null
          client_token_secret_id?: string | null
          created_at?: string | null
          empresa_id?: string | null
          envio_real_liberado?: boolean
          id?: string
          instance_id?: string | null
          nome_instancia?: string | null
          notificar_enviadas_por_mim?: boolean | null
          numero_origem?: string | null
          token?: string | null
          token_secret_id?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_zapi_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          legal_name: string | null
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          legal_name?: string | null
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          legal_name?: string | null
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      origens: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          is_active: boolean
          nome: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          is_active?: boolean
          nome: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          is_active?: boolean
          nome?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "origens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pe_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pe_audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "pe_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pe_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by_user_id: string
          organization_id: string
          role_id: string
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by_user_id: string
          organization_id: string
          role_id: string
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by_user_id?: string
          organization_id?: string
          role_id?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pe_invitations_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "pe_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_invitations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "pe_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      pe_roles: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      pe_tenant_map: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          organization_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          organization_id?: string
        }
        Relationships: []
      }
      pe_users: {
        Row: {
          avatar_url: string | null
          cargo: string | null
          created_at: string
          email: string
          email_signature: string | null
          full_name: string
          id: string
          is_active: boolean
          is_super_admin: boolean
          organization_id: string | null
          phone: string | null
          role_id: string | null
          signature_image_path: string | null
          signature_image_url: string | null
          updated_at: string
          use_personal_signature: boolean | null
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string
          email: string
          email_signature?: string | null
          full_name: string
          id: string
          is_active?: boolean
          is_super_admin?: boolean
          organization_id?: string | null
          phone?: string | null
          role_id?: string | null
          signature_image_path?: string | null
          signature_image_url?: string | null
          updated_at?: string
          use_personal_signature?: boolean | null
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string
          email?: string
          email_signature?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_super_admin?: boolean
          organization_id?: string | null
          phone?: string | null
          role_id?: string | null
          signature_image_path?: string | null
          signature_image_url?: string | null
          updated_at?: string
          use_personal_signature?: boolean | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pe_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "pe_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          categoria: string
          codigo: string
          created_at: string
          id: string
          is_active: boolean
          nome: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          categoria: string
          codigo: string
          created_at?: string
          id?: string
          is_active?: boolean
          nome: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          categoria?: string
          codigo?: string
          created_at?: string
          id?: string
          is_active?: boolean
          nome?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean | null
          avatar_url: string | null
          cargo: string | null
          created_at: string | null
          email: string | null
          empresa_id: string | null
          id: string
          nome: string | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string | null
          email?: string | null
          empresa_id?: string | null
          id: string
          nome?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string | null
          email?: string | null
          empresa_id?: string | null
          id?: string
          nome?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          descricao: string | null
          empresa_id: string
          event_type: string
          id: string
          metadata: Json | null
          prospect_id: string
          titulo: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          descricao?: string | null
          empresa_id: string
          event_type: string
          id?: string
          metadata?: Json | null
          prospect_id: string
          titulo?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          descricao?: string | null
          empresa_id?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          prospect_id?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospect_events_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "orbit_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_empresa: {
        Row: {
          activated_at: string | null
          billing_status: string | null
          cancel_at_period_end: boolean | null
          created_at: string
          created_by_user_id: string
          current_period_end: string | null
          current_period_start: string | null
          empresa_id: string
          invited_at: string | null
          last_invoice_status: string | null
          last_payment_error: string | null
          monthly_price_cents_override: number | null
          plan_id: string
          responsible_email: string | null
          responsible_name: string | null
          setup_fee_cents_override: number | null
          status: string
          stripe_customer_id: string | null
          stripe_status: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          billing_status?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string
          created_by_user_id: string
          current_period_end?: string | null
          current_period_start?: string | null
          empresa_id: string
          invited_at?: string | null
          last_invoice_status?: string | null
          last_payment_error?: string | null
          monthly_price_cents_override?: number | null
          plan_id: string
          responsible_email?: string | null
          responsible_name?: string | null
          setup_fee_cents_override?: number | null
          status?: string
          stripe_customer_id?: string | null
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          billing_status?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string
          created_by_user_id?: string
          current_period_end?: string | null
          current_period_start?: string | null
          empresa_id?: string
          invited_at?: string | null
          last_invoice_status?: string | null
          last_payment_error?: string | null
          monthly_price_cents_override?: number | null
          plan_id?: string
          responsible_email?: string | null
          responsible_name?: string | null
          setup_fee_cents_override?: number | null
          status?: string
          stripe_customer_id?: string | null
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_empresa_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_empresa_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_invites: {
        Row: {
          created_at: string
          created_by_user_id: string
          email: string
          empresa_id: string
          expires_at: string
          id: string
          metadata: Json | null
          responsible_name: string | null
          token_hash: string
          used_at: string | null
          used_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          email: string
          empresa_id: string
          expires_at: string
          id?: string
          metadata?: Json | null
          responsible_name?: string | null
          token_hash: string
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          email?: string
          empresa_id?: string
          expires_at?: string
          id?: string
          metadata?: Json | null
          responsible_name?: string | null
          token_hash?: string
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saas_invites_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_plans: {
        Row: {
          code: string
          created_at: string
          features: Json
          id: string
          limits: Json
          monthly_price_cents: number | null
          name: string
          setup_fee_cents: number | null
          stripe_active: boolean | null
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          features?: Json
          id?: string
          limits?: Json
          monthly_price_cents?: number | null
          name: string
          setup_fee_cents?: number | null
          stripe_active?: boolean | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          features?: Json
          id?: string
          limits?: Json
          monthly_price_cents?: number | null
          name?: string
          setup_fee_cents?: number | null
          stripe_active?: boolean | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      saas_usage_monthly: {
        Row: {
          created_at: string
          email_sent: number
          empresa_id: string
          fb_sent: number
          id: string
          ig_sent: number
          lead_search_calls: number
          period: string
          updated_at: string
          whatsapp_sent: number
        }
        Insert: {
          created_at?: string
          email_sent?: number
          empresa_id: string
          fb_sent?: number
          id?: string
          ig_sent?: number
          lead_search_calls?: number
          period: string
          updated_at?: string
          whatsapp_sent?: number
        }
        Update: {
          created_at?: string
          email_sent?: number
          empresa_id?: string
          fb_sent?: number
          id?: string
          ig_sent?: number
          lead_search_calls?: number
          period?: string
          updated_at?: string
          whatsapp_sent?: number
        }
        Relationships: [
          {
            foreignKeyName: "saas_usage_monthly_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      segmentos: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          macro: string
          micro: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          macro: string
          micro?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          macro?: string
          micro?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "segmentos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas: {
        Row: {
          assigned_to_user_id: string
          cliente_id: string
          contato_id: string | null
          created_at: string
          created_by_user_id: string
          descricao: string | null
          done_at: string | null
          due_date: string | null
          id: string
          oportunidade_id: string | null
          organization_id: string
          prioridade: string
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          assigned_to_user_id: string
          cliente_id: string
          contato_id?: string | null
          created_at?: string
          created_by_user_id: string
          descricao?: string | null
          done_at?: string | null
          due_date?: string | null
          id?: string
          oportunidade_id?: string | null
          organization_id: string
          prioridade?: string
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          assigned_to_user_id?: string
          cliente_id?: string
          contato_id?: string | null
          created_at?: string
          created_by_user_id?: string
          descricao?: string | null
          done_at?: string | null
          due_date?: string | null
          id?: string
          oportunidade_id?: string | null
          organization_id?: string
          prioridade?: string
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "pe_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "pe_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_requests: {
        Row: {
          created_at: string
          email: string
          empresa: string
          id: string
          nome: string
          plan_code: string
          status: string
          telefone: string | null
        }
        Insert: {
          created_at?: string
          email: string
          empresa: string
          id?: string
          nome: string
          plan_code?: string
          status?: string
          telefone?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          empresa?: string
          id?: string
          nome?: string
          plan_code?: string
          status?: string
          telefone?: string | null
        }
        Relationships: []
      }
      user_empresa_memberships: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_empresa_memberships_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _build_orbit_zapi_public_response: {
        Args: { p_config_id: string }
        Returns: Json
      }
      _build_orbit_zapi_runtime_response: {
        Args: { p_config_id: string }
        Returns: Json
      }
      _lead_score_haystack: {
        Args: {
          p_prospect: Database["public"]["Tables"]["orbit_prospects"]["Row"]
        }
        Returns: string
      }
      _lead_score_jsonb_values: { Args: { p_data: Json }; Returns: string }
      advisor_apply_gate: {
        Args: { p_empresa: string; p_kind: string; p_target_id: string }
        Returns: Json
      }
      apply_flow_pause: {
        Args: { p_empresa: string; p_flow: string }
        Returns: Json
      }
      apply_flow_variation_draft: {
        Args: { p_empresa: string; p_flow: string }
        Returns: Json
      }
      apply_pipeline_template: {
        Args: {
          p_empresa_id: string
          p_replace?: boolean
          p_template_id: string
        }
        Returns: Json
      }
      apply_stage_followup: {
        Args: { p_empresa: string; p_stage: string; p_template: Json }
        Returns: Json
      }
      cancel_scheduled_actions: {
        Args: {
          _deal_id?: string
          _empresa_id: string
          _prospect_id?: string
          _reason?: string
        }
        Returns: number
      }
      cancel_scheduled_actions_on_reply: {
        Args: { _empresa_id: string; _prospect_id: string; _reason?: string }
        Returns: number
      }
      claim_scheduled_actions: {
        Args: { _batch?: number }
        Returns: {
          action_config: Json
          action_id: string | null
          action_type: string
          attempts: number
          canceled_reason: string | null
          context: Json
          created_at: string
          deal_id: string | null
          empresa_id: string
          flow_id: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          ordem: number
          prospect_id: string | null
          run_id: string
          scheduled_for: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "orbit_flow_scheduled_actions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ensure_deal_for_prospect: {
        Args: { _prospect_id: string }
        Returns: string
      }
      extract_domain: { Args: { p: string }; Returns: string }
      generate_unique_slug: { Args: { p_nome: string }; Returns: string }
      get_advisor_snapshot: { Args: { p_empresa_id: string }; Returns: Json }
      get_advisor_snapshot_admin: {
        Args: { p_empresa_id: string }
        Returns: Json
      }
      get_campaign_analytics_summary: {
        Args: { p_campaign_id: string }
        Returns: {
          bounced: number
          clicked: number
          complained: number
          delivered: number
          no_interaction: number
          opened: number
          total_recipients: number
          total_sent: number
        }[]
      }
      get_campaign_events_timeline: {
        Args: { p_campaign_id: string; p_interval?: string }
        Returns: {
          aberturas: number
          bucket: string
          cliques: number
          entregues: number
          enviados: number
          leituras: number
          respostas: number
        }[]
      }
      get_campaign_recipient_counts: {
        Args: { p_campaign_ids: string[] }
        Returns: {
          campaign_id: string
          enviado: number
          falhou: number
          ignorado: number
          pendente: number
          total: number
        }[]
      }
      get_empresa_by_slug: { Args: { p_slug: string }; Returns: Json }
      get_my_empresas: {
        Args: never
        Returns: {
          empresa_id: string
          is_active: boolean
          nome: string
          role: string
          slug: string
        }[]
      }
      get_onboarding_by_token: { Args: { p_token: string }; Returns: Json }
      get_orbit_analytics_summary: {
        Args: { p_empresa_id: string }
        Returns: Json
      }
      get_orbit_zapi_config_public: {
        Args: { p_empresa_id: string }
        Returns: Json
      }
      get_orbit_zapi_runtime_config: {
        Args: { p_empresa_id: string }
        Returns: Json
      }
      get_orbit_zapi_runtime_config_by_id: {
        Args: { p_config_id: string }
        Returns: Json
      }
      get_orbit_zapi_secret_name: {
        Args: { p_config_id: string; p_empresa_id?: string; p_kind: string }
        Returns: string
      }
      get_prospect_engagement_summary: {
        Args: { p_dias?: number; p_empresa_id: string }
        Returns: {
          bounced: boolean
          complained: boolean
          engajamento_score: number
          prospect_id: string
          total_aberturas: number
          total_cliques: number
          total_emails: number
          ultima_abertura_em: string
          ultimo_clique_em: string
        }[]
      }
      get_system_health_kpis: { Args: { p_hours?: number }; Returns: Json }
      get_system_health_recent_logs: {
        Args: { p_limit?: number }
        Returns: Json
      }
      get_user_empresa_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_advisor_scan_targets: {
        Args: never
        Returns: {
          empresa_id: string
          nome: string
          plano: string
        }[]
      }
      list_public_plans: {
        Args: never
        Returns: {
          code: string
          name: string
        }[]
      }
      match_orbit_knowledge: {
        Args: {
          match_count?: number
          min_similarity?: number
          p_empresa_id: string
          query_embedding: string
        }
        Returns: {
          conteudo_texto: string
          id: string
          similarity: number
          source_id: string
          tipo: string
          titulo: string
        }[]
      }
      normalize_email: { Args: { p: string }; Returns: string }
      normalize_name: { Args: { p: string }; Returns: string }
      normalize_phone: { Args: { p: string }; Returns: string }
      normalize_slug: { Args: { p: string }; Returns: string }
      orbit_first_stage_id: { Args: { p_empresa_id: string }; Returns: string }
      orbit_resend_has_api_key: {
        Args: { p_empresa_id: string }
        Returns: boolean
      }
      orbit_seed_default_pipeline: {
        Args: { _empresa_id: string }
        Returns: undefined
      }
      orbit_zapi_connection_status: {
        Args: { _empresa_id: string }
        Returns: {
          disconnect_reason: string
          instance_id: string
          last_disconnect_at: string
          last_receive_at: string
          status: string
        }[]
      }
      pe_backfill_import_as_lista: {
        Args: {
          p_empresa_id: string
          p_import_id: string
          p_lista_tag: string
          p_window_minutes?: number
        }
        Returns: Json
      }
      pe_delete_tenant_map: {
        Args: { p_empresa_id: string }
        Returns: undefined
      }
      pe_get_user_org_id: { Args: { p_user_id: string }; Returns: string }
      pe_get_user_role_code: { Args: { p_user_id: string }; Returns: string }
      pe_is_super_admin: { Args: { p_user_id: string }; Returns: boolean }
      pe_populate_campaign_recipients: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      pe_promote_prospect: {
        Args: {
          p_create_opportunity?: boolean
          p_empresa_id: string
          p_owner_user_id?: string
          p_prospect_id: string
        }
        Returns: Json
      }
      pe_provision_tenant: {
        Args: {
          p_created_by_user_id: string
          p_empresa_id: string
          p_empresa_nome: string
        }
        Returns: Json
      }
      pe_upsert_tenant_map: {
        Args: { p_empresa_id: string; p_organization_id: string }
        Returns: Json
      }
      pe_user_can_write: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      pe_user_is_orbit_admin: { Args: { p_user_id: string }; Returns: boolean }
      pe_user_is_orbit_member: { Args: { p_user_id: string }; Returns: boolean }
      pe_user_is_org_admin: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      pe_user_is_sales_or_sdr: { Args: { p_user_id: string }; Returns: boolean }
      recalculate_lead_score: {
        Args: { p_empresa_id: string; p_prospect_id: string }
        Returns: Json
      }
      reschedule_scheduled_action: {
        Args: { _delay_seconds: number; _error: string; _id: string }
        Returns: undefined
      }
      saas_can_use: {
        Args: {
          p_amount?: number
          p_empresa_id: string
          p_feature_code: string
        }
        Returns: Json
      }
      saas_get_empresa_plan: { Args: { p_empresa_id: string }; Returns: Json }
      saas_increment_usage: {
        Args: {
          p_amount?: number
          p_empresa_id: string
          p_feature_code: string
        }
        Returns: undefined
      }
      save_onboarding_responses: {
        Args: { p_responses: Json; p_token: string }
        Returns: Json
      }
      set_active_empresa: { Args: { p_empresa_id: string }; Returns: Json }
      submit_onboarding: {
        Args: { p_responses: Json; p_token: string }
        Returns: Json
      }
      super_admin_exists: { Args: never; Returns: boolean }
      switch_active_empresa: { Args: { p_empresa_id: string }; Returns: Json }
      upsert_orbit_zapi_config_secure: {
        Args: {
          p_ativo?: boolean
          p_client_token?: string
          p_empresa_id: string
          p_instance_id?: string
          p_nome_instancia?: string
          p_notificar_enviadas_por_mim?: boolean
          p_numero_origem?: string
          p_token?: string
          p_webhook_url?: string
        }
        Returns: Json
      }
      user_has_empresa_access: {
        Args: { _empresa_id: string }
        Returns: boolean
      }
      validate_documento: { Args: { p_doc: string }; Returns: Json }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "vendedor" | "visualizador"
      orbit_flow_action_type:
        | "send_whatsapp_template"
        | "move_deal_stage"
        | "create_task"
        | "toggle_ai_agent"
        | "notify_vendedor"
      orbit_flow_run_status:
        | "pending"
        | "running"
        | "success"
        | "error"
        | "skipped"
      orbit_flow_trigger_type:
        | "prospect_qualified"
        | "deal_stage_changed"
        | "deal_idle"
        | "conversa_no_reply"
        | "meeting_reminder_24h"
        | "meeting_reminder_1h"
        | "lead_recebido"
        | "lead_replied"
      orbit_onboarding_status:
        | "rascunho"
        | "enviado"
        | "em_andamento"
        | "concluido"
        | "revisado"
        | "arquivado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "vendedor", "visualizador"],
      orbit_flow_action_type: [
        "send_whatsapp_template",
        "move_deal_stage",
        "create_task",
        "toggle_ai_agent",
        "notify_vendedor",
      ],
      orbit_flow_run_status: [
        "pending",
        "running",
        "success",
        "error",
        "skipped",
      ],
      orbit_flow_trigger_type: [
        "prospect_qualified",
        "deal_stage_changed",
        "deal_idle",
        "conversa_no_reply",
        "meeting_reminder_24h",
        "meeting_reminder_1h",
        "lead_recebido",
        "lead_replied",
      ],
      orbit_onboarding_status: [
        "rascunho",
        "enviado",
        "em_andamento",
        "concluido",
        "revisado",
        "arquivado",
      ],
    },
  },
} as const
