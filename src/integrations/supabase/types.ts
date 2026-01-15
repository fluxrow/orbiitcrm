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
          mensagem_boas_vindas: string | null
          mensagem_fora_horario: string | null
          modo_automatico: boolean | null
          prompt_treinamento: string | null
          responder_fora_horario: boolean | null
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
          mensagem_boas_vindas?: string | null
          mensagem_fora_horario?: string | null
          modo_automatico?: boolean | null
          prompt_treinamento?: string | null
          responder_fora_horario?: boolean | null
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
          mensagem_boas_vindas?: string | null
          mensagem_fora_horario?: string | null
          modo_automatico?: boolean | null
          prompt_treinamento?: string | null
          responder_fora_horario?: boolean | null
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
      orbit_campaign_recipients: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          email: string | null
          empresa_id: string | null
          enviado_em: string | null
          erro: string | null
          id: string
          prospect_id: string | null
          status: string | null
          telefone: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          email?: string | null
          empresa_id?: string | null
          enviado_em?: string | null
          erro?: string | null
          id?: string
          prospect_id?: string | null
          status?: string | null
          telefone?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          email?: string | null
          empresa_id?: string | null
          enviado_em?: string | null
          erro?: string | null
          id?: string
          prospect_id?: string | null
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
          canal: string | null
          created_at: string | null
          empresa_id: string | null
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
          canal?: string | null
          created_at?: string | null
          empresa_id?: string | null
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
          canal?: string | null
          created_at?: string | null
          empresa_id?: string | null
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
          data_prevista_fechamento: string | null
          empresa_id: string | null
          etapa_id: string | null
          id: string
          motivo_perda: string | null
          probabilidade: number | null
          prospect_id: string | null
          responsavel_id: string | null
          titulo: string
          updated_at: string | null
          valor_estimado: number | null
        }
        Insert: {
          created_at?: string | null
          data_prevista_fechamento?: string | null
          empresa_id?: string | null
          etapa_id?: string | null
          id?: string
          motivo_perda?: string | null
          probabilidade?: number | null
          prospect_id?: string | null
          responsavel_id?: string | null
          titulo: string
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Update: {
          created_at?: string | null
          data_prevista_fechamento?: string | null
          empresa_id?: string | null
          etapa_id?: string | null
          id?: string
          motivo_perda?: string | null
          probabilidade?: number | null
          prospect_id?: string | null
          responsavel_id?: string | null
          titulo?: string
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
      orbit_empresas: {
        Row: {
          ativo: boolean | null
          cnpj: string | null
          created_at: string | null
          data_expiracao: string | null
          email_contato: string | null
          id: string
          logo_url: string | null
          max_usuarios: number | null
          nome: string
          plano: string | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          cnpj?: string | null
          created_at?: string | null
          data_expiracao?: string | null
          email_contato?: string | null
          id?: string
          logo_url?: string | null
          max_usuarios?: number | null
          nome: string
          plano?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          cnpj?: string | null
          created_at?: string | null
          data_expiracao?: string | null
          email_contato?: string | null
          id?: string
          logo_url?: string | null
          max_usuarios?: number | null
          nome?: string
          plano?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
      orbit_mensagens: {
        Row: {
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
          nome: string
          updated_at: string | null
          variaveis: string[] | null
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
          nome: string
          updated_at?: string | null
          variaveis?: string[] | null
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
          nome?: string
          updated_at?: string | null
          variaveis?: string[] | null
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
          email_principal: string | null
          empresa_id: string | null
          estado: string | null
          id: string
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
          telefone_whatsapp: string | null
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          cidade?: string | null
          cnpj_cpf?: string | null
          consentimento_email?: boolean | null
          consentimento_whatsapp?: boolean | null
          created_at?: string | null
          email_principal?: string | null
          empresa_id?: string | null
          estado?: string | null
          id?: string
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
          telefone_whatsapp?: string | null
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          cidade?: string | null
          cnpj_cpf?: string | null
          consentimento_email?: boolean | null
          consentimento_whatsapp?: boolean | null
          created_at?: string | null
          email_principal?: string | null
          empresa_id?: string | null
          estado?: string | null
          id?: string
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
          telefone_whatsapp?: string | null
          tipo?: string | null
          updated_at?: string | null
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
      orbit_zapi_config: {
        Row: {
          ativo: boolean | null
          client_token: string | null
          created_at: string | null
          empresa_id: string | null
          id: string
          instance_id: string | null
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
      get_user_empresa_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
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
