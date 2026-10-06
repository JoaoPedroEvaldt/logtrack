"""Telas e scripts do frontend saem com Cache-Control: no-cache — sem isso o
navegador reaproveitava um .js antigo depois de um deploy e misturava
versões (tela presa em "carregando")."""


def test_html_js_css_pedem_para_o_navegador_conferir_a_versao(client):
    for caminho in ("/", "/pages/mapa-frota.html", "/js/api.js", "/css/style.css"):
        resp = client.get(caminho)
        assert resp.status_code == 200, caminho
        assert resp.headers.get("cache-control") == "no-cache", caminho


def test_api_nao_ganha_o_cabecalho_de_estaticos(client):
    resp = client.get("/health")
    assert resp.headers.get("cache-control") is None
