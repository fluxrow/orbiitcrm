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
          uf: string | null
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
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
          uf?: string | null
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
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
      orbit_ai_config: {
        Row: {
          campos_cadastro: string[] | null
          created_at: string | null
          empresa_id: string | null
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          idioma: string | null
          max_tokens: number | null
          mensagem_boas_vindas: string | null
          mensagem_fora_horario: string | null
          modo_automatico: boolean | null
          prompt_orcamentos: string | null
          prompt_treinamento: string | null
          responder_fora_horario: boolean | null
          tempo_espera: number | null
          tom_conversa: string | null
          updated_at: string | null
        }
        Insert: {
          campos_cadastro?: string[] | null
          created_at?: string | null
          empresa_id?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          idioma?: string | null
          max_tokens?: number | null
          mensagem_boas_vindas?: string | null
          mensagem_fora_horario?: string | null
          modo_automatico?: boolean | null
          prompt_orcamentos?: string | null
          prompt_treinamento?: string | null
          responder_fora_horario?: boolean | null
          tempo_espera?: number | null
          tom_conversa?: string | null
          updated_at?: string | null
        }
        Update: {
          campos_cadastro?: string[] | null
          created_at?: string | null
          empresa_id?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          idioma?: string | null
          max_tokens?: number | null
          mensagem_boas_vindas?: string | null
          mensagem_fora_horario?: string | null
          modo_automatico?: boolean | null
          prompt_orcamentos?: string | null
          prompt_treinamento?: string | null
          responder_fora_horario?: boolean | null
          tempo_espera?: number | null
          tom_conversa?: string | null
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
      orbit_conversas: {
        Row: {
          ai_contexto: Json | null
          ai_processing: boolean | null
          canal: string | null
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
          documentos_checklist: Json | null
          empresa_id: string | null
          etapa_id: string | null
          id: string
          motivo_perda: string | null
          moved_at: string | null
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
          documentos_checklist?: Json | null
          empresa_id?: string | null
          etapa_id?: string | null
          id?: string
          motivo_perda?: string | null
          moved_at?: string | null
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
          documentos_checklist?: Json | null
          empresa_id?: string | null
          etapa_id?: string | null
          id?: string
          motivo_perda?: string | null
          moved_at?: string | null
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
      orbit_enrichment_credits: {
        Row: {
          creditos_limite: number | null
          creditos_usados: number | null
          data: string | null
          empresa_id: string | null
          id: string
        }
        Insert: {
          creditos_limite?: number | null
          creditos_usados?: number | null
          data?: string | null
          empresa_id?: string | null
          id?: string
        }
        Update: {
          creditos_limite?: number | null
          creditos_usados?: number | null
          data?: string | null
          empresa_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_enrichment_credits_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_enrichment_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          empresa_id: string | null
          falhas: number | null
          id: string
          processados: number | null
          status: string | null
          sucesso: number | null
          tipo: string | null
          total_leads: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          empresa_id?: string | null
          falhas?: number | null
          id?: string
          processados?: number | null
          status?: string | null
          sucesso?: number | null
          tipo?: string | null
          total_leads?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          empresa_id?: string | null
          falhas?: number | null
          id?: string
          processados?: number | null
          status?: string | null
          sucesso?: number | null
          tipo?: string | null
          total_leads?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_enrichment_jobs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_enrichment_policy: {
        Row: {
          ativa: boolean | null
          cooldown_horas: number | null
          created_at: string | null
          custo_email: number | null
          custo_telefone: number | null
          empresa_id: string | null
          id: string
          limite_diario: number | null
          limite_por_job: number | null
          status_permitidos: string[] | null
          tentativas_por_lead: number | null
          updated_at: string | null
        }
        Insert: {
          ativa?: boolean | null
          cooldown_horas?: number | null
          created_at?: string | null
          custo_email?: number | null
          custo_telefone?: number | null
          empresa_id?: string | null
          id?: string
          limite_diario?: number | null
          limite_por_job?: number | null
          status_permitidos?: string[] | null
          tentativas_por_lead?: number | null
          updated_at?: string | null
        }
        Update: {
          ativa?: boolean | null
          cooldown_horas?: number | null
          created_at?: string | null
          custo_email?: number | null
          custo_telefone?: number | null
          empresa_id?: string | null
          id?: string
          limite_diario?: number | null
          limite_por_job?: number | null
          status_permitidos?: string[] | null
          tentativas_por_lead?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_enrichment_policy_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_enrichment_queue: {
        Row: {
          created_at: string | null
          empresa_id: string | null
          erro: string | null
          id: string
          job_id: string | null
          lead_id: string | null
          motivo_skip: string | null
          prioridade: number | null
          processed_at: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          empresa_id?: string | null
          erro?: string | null
          id?: string
          job_id?: string | null
          lead_id?: string | null
          motivo_skip?: string | null
          prioridade?: number | null
          processed_at?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          empresa_id?: string | null
          erro?: string | null
          id?: string
          job_id?: string | null
          lead_id?: string | null
          motivo_skip?: string | null
          prioridade?: number | null
          processed_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_enrichment_queue_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_enrichment_queue_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "orbit_enrichment_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_enrichment_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "orbit_leads"
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
      orbit_icps: {
        Row: {
          created_at: string | null
          empresa_id: string | null
          filtros: Json | null
          id: string
          nome: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          empresa_id?: string | null
          filtros?: Json | null
          id?: string
          nome: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          empresa_id?: string | null
          filtros?: Json | null
          id?: string
          nome?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_icps_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
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
      orbit_lead_searches: {
        Row: {
          created_at: string | null
          empresa_id: string | null
          executed_at: string | null
          filtros: Json | null
          icp_id: string | null
          id: string
          leads_encontrados: number | null
          leads_importados: number | null
          nome: string
          observacoes: string | null
          source_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          empresa_id?: string | null
          executed_at?: string | null
          filtros?: Json | null
          icp_id?: string | null
          id?: string
          leads_encontrados?: number | null
          leads_importados?: number | null
          nome: string
          observacoes?: string | null
          source_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          empresa_id?: string | null
          executed_at?: string | null
          filtros?: Json | null
          icp_id?: string | null
          id?: string
          leads_encontrados?: number | null
          leads_importados?: number | null
          nome?: string
          observacoes?: string | null
          source_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_lead_searches_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_lead_searches_icp_id_fkey"
            columns: ["icp_id"]
            isOneToOne: false
            referencedRelation: "orbit_icps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_lead_searches_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "orbit_lead_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_lead_sources: {
        Row: {
          ativo: boolean | null
          config: Json | null
          created_at: string | null
          empresa_id: string | null
          id: string
          nome: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          config?: Json | null
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          nome: string
          tipo: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          config?: Json | null
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string | null
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
      orbit_leads: {
        Row: {
          cargo: string | null
          cidade: string | null
          created_at: string | null
          dados_raw: Json | null
          email: string | null
          empresa_id: string | null
          empresa_linkedin: string | null
          empresa_nome: string | null
          enrichment_status: string | null
          enrichment_tentativas: number | null
          estado: string | null
          id: string
          linkedin_url: string | null
          nome: string | null
          pais: string | null
          score: number | null
          search_id: string | null
          status: string | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          cargo?: string | null
          cidade?: string | null
          created_at?: string | null
          dados_raw?: Json | null
          email?: string | null
          empresa_id?: string | null
          empresa_linkedin?: string | null
          empresa_nome?: string | null
          enrichment_status?: string | null
          enrichment_tentativas?: number | null
          estado?: string | null
          id?: string
          linkedin_url?: string | null
          nome?: string | null
          pais?: string | null
          score?: number | null
          search_id?: string | null
          status?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          cargo?: string | null
          cidade?: string | null
          created_at?: string | null
          dados_raw?: Json | null
          email?: string | null
          empresa_id?: string | null
          empresa_linkedin?: string | null
          empresa_nome?: string | null
          enrichment_status?: string | null
          enrichment_tentativas?: number | null
          estado?: string | null
          id?: string
          linkedin_url?: string | null
          nome?: string | null
          pais?: string | null
          score?: number | null
          search_id?: string | null
          status?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbit_leads_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "orbit_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_leads_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "orbit_lead_searches"
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
          cor: string | null
          created_at: string | null
          empresa_id: string | null
          id: string
          is_lost: boolean | null
          is_won: boolean | null
          nome: string
          ordem: number
        }
        Insert: {
          cor?: string | null
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          is_lost?: boolean | null
          is_won?: boolean | null
          nome: string
          ordem: number
        }
        Update: {
          cor?: string | null
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          is_lost?: boolean | null
          is_won?: boolean | null
          nome?: string
          ordem?: number
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
      orbit_prospects: {
        Row: {
          cidade: string | null
          cnpj_cpf: string | null
          consentimento_email: boolean | null
          consentimento_whatsapp: boolean | null
          created_at: string | null
          deleted_at: string | null
          email_principal: string | null
          empresa_id: string | null
          estado: string | null
          id: string
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
          deleted_at?: string | null
          email_principal?: string | null
          empresa_id?: string | null
          estado?: string | null
          id?: string
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
          deleted_at?: string | null
          email_principal?: string | null
          empresa_id?: string | null
          estado?: string | null
          id?: string
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
          created_at: string | null
          empresa_id: string | null
          id: string
          instance_id: string | null
          nome_instancia: string | null
          notificar_enviadas_por_mim: boolean | null
          numero_origem: string | null
          token: string | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          ativo?: boolean | null
          client_token?: string | null
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          instance_id?: string | null
          nome_instancia?: string | null
          notificar_enviadas_por_mim?: boolean | null
          numero_origem?: string | null
          token?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          ativo?: boolean | null
          client_token?: string | null
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          instance_id?: string | null
          nome_instancia?: string | null
          notificar_enviadas_por_mim?: boolean | null
          numero_origem?: string | null
          token?: string | null
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
          plan_id: string
          responsible_email: string | null
          responsible_name: string | null
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
          plan_id: string
          responsible_email?: string | null
          responsible_name?: string | null
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
          plan_id?: string
          responsible_email?: string | null
          responsible_name?: string | null
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
          name: string
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
          name: string
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
          name?: string
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
      extract_domain: { Args: { p: string }; Returns: string }
      generate_unique_slug: { Args: { p_nome: string }; Returns: string }
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
      get_orbit_analytics_summary: {
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
      get_user_empresa_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_public_plans: {
        Args: never
        Returns: {
          code: string
          name: string
        }[]
      }
      normalize_email: { Args: { p: string }; Returns: string }
      normalize_name: { Args: { p: string }; Returns: string }
      normalize_phone: { Args: { p: string }; Returns: string }
      normalize_slug: { Args: { p: string }; Returns: string }
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
      set_active_empresa: { Args: { p_empresa_id: string }; Returns: Json }
      super_admin_exists: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "vendedor" | "visualizador"
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
    },
  },
} as const
