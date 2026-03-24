"""
BGT → CO2 Monitor dataverwerking

Dit script combineert BGT wegdeeldata uit meerdere provincies (CSV-bestanden)
en verrijkt deze met aanvullende datasets:

- Gemeentegegevens
- Bodemfactor per gemeente
- DuboCalc CO2- en MKI-gegevens

Het resultaat wordt opgeslagen in:
1. Een SQLite database (tussenresultaten per stap)
2. Een eindbestand in CSV-formaat voor gebruik in de CO2-monitor.

Workflow:
1. Inlezen BGT CSV-bestanden (wegen)
2. Samenvoegen en aggregeren van BGT-data
3. Koppelen van gemeentelijke metadata
4. Toevoegen bodemfactor per gemeente
5. Verrijken met DuboCalc materiaaldata
6. Exporteren van einddataset

Versie: juli 2025
Aanpassing: vervangingen in project toegevoegd
"""

import pandas as pd
import os
import glob
import sqlite3


def get_script_directory():
    """
    Bepaalt de map waarin het script staat.

    Returns
    -------
    str
        Absolute pad naar de map van dit script.
    """
    return os.path.dirname(os.path.abspath(__file__))


def load_or_process_data(file_pattern, db_connection):
    """
    Laad BGT brondata uit SQLite of verwerk CSV-bestanden.

    Als de tabel 'bgt_raw' al bestaat in de database, wordt deze geladen.
    Anders worden alle CSV-bestanden die voldoen aan het file_pattern
    ingelezen en samengevoegd.

    Parameters
    ----------
    file_pattern : str
        Glob-pattern voor het vinden van BGT CSV-bestanden.
    db_connection : sqlite3.Connection
        Verbinding met SQLite database.

    Returns
    -------
    pandas.DataFrame
        Samengevoegde BGT dataset.
    """

    query = "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='bgt_raw';"

    if pd.read_sql_query(query, db_connection).iloc[0, 0] == 1:
        print("Table bgt_raw found. Loading data.")
        df = pd.read_sql_query("SELECT * FROM bgt_raw", db_connection)

    else:
        print("Table bgt_raw not found. Processing files.")

        all_files = glob.glob(file_pattern)
        df_list = []

        for file in all_files:
            try:
                print(f"Processing file: {file}")

                # CSV bestanden zijn ; gescheiden en gebruiken ,
                df = pd.read_csv(file, sep=';', decimal=',')

                print(f"Rows read from {file}: {len(df)}")
                df_list.append(df)

            except Exception as e:
                print(f"Error processing file {file}: {e}")

        # Combineer alle provinciale datasets
        df = pd.concat(df_list, ignore_index=True)

        # Opslaan in SQLite voor snellere herstart
        df.to_sql("bgt_raw", db_connection, if_exists="replace", index=False)

    print(f"Rows in dataframe after load_or_process_data: {len(df)}")

    return df


def process_bgt_data(df, db_connection):
    """
    Verwerkt de ruwe BGT-data naar een geaggregeerd formaat.

    Belangrijke stappen:
    - Hernoemen kolommen
    - Groeperen op BGT classificaties
    - Berekenen totaal oppervlak
    - Afleiden organisatietype en gemeentecode

    Parameters
    ----------
    df : pandas.DataFrame
        Ruwe BGT dataset.
    db_connection : sqlite3.Connection
        SQLite database verbinding.

    Returns
    -------
    pandas.DataFrame
        Geaggregeerde BGT dataset.
    """

    query = "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='bgt_processed';"

    # Mapping van bronhoudercode naar organisatietype
    mapping = {
        'G': 'Gemeente',
        'P': 'Provincie',
        'L': 'Landelijke organisatie',
        'W': 'Waterschap'
    }

    if pd.read_sql_query(query, db_connection).iloc[0, 0] == 1:
        print("Table bgt_processed found. Loading data.")
        df = pd.read_sql_query("SELECT * FROM bgt_processed", db_connection)

    else:
        print("Table bgt_processed not found. Processing data.")

        # Kolomnaam harmoniseren
        df = df.rename(columns={'Sheet Name': 'Provincie'})

        # Aggregatie van oppervlak per type wegverharding
        df = df.groupby([
            'Bronhouder',
            'BgtFunctie',
            'BgtFysiekVoorkomen',
            df['PlusFysiekVoorkomen'].fillna("BGT leeg, gemiddeld verhardingstype")
        ])['_area'].sum().reset_index(name='area')

        df['Leeg'] = ''

        # Organisatietype afleiden uit eerste karakter bronhoudercode
        df['Organisatietype'] = df['Bronhouder'].str[0].map(mapping)

        # Gemeentecode afleiden uit laatste twee tekens
        df['Gemeentecode'] = df['Bronhouder'].str[-2:]
        df['Gemeentecode'] = pd.to_numeric(df['Gemeentecode'])

        df.to_sql("bgt_processed", db_connection, if_exists="replace", index=False)

    print(f"Rows in dataframe after process_bgt_data: {len(df)}")

    return df


def join_gemeenten_data(bgt_df, gemeenten_df, db_connection):
    """
    Koppelt gemeentelijke metadata aan de BGT dataset.

    Parameters
    ----------
    bgt_df : pandas.DataFrame
        Verwerkte BGT dataset.
    gemeenten_df : pandas.DataFrame
        Dataset met gemeentelijke kenmerken.
    db_connection : sqlite3.Connection

    Returns
    -------
    pandas.DataFrame
        BGT dataset verrijkt met gemeentelijke informatie.
    """

    query = "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='bgt_joined_gemeenten';"

    if pd.read_sql_query(query, db_connection).iloc[0, 0] == 1:
        print("Table bgt_joined_gemeenten found. Loading data.")
        df = pd.read_sql_query("SELECT * FROM bgt_joined_gemeenten", db_connection)

    else:
        print("Table bgt_joined_gemeenten not found. Joining data.")

        df = bgt_df.join(
            gemeenten_df.set_index('BronhouderCode'),
            on='Bronhouder'
        )

        df.to_sql("bgt_joined_gemeenten", db_connection, if_exists="replace", index=False)

    print(f"Rows in dataframe after join_gemeenten_data: {len(df)}")

    return df


def add_bodemfactor_data(bgt_df, bodemfactor_gemeenten_path, db_connection):
    """
    Voegt bodemfactor per gemeente toe aan de dataset.

    Deze factor wordt gebruikt voor CO2-berekeningen.

    Parameters
    ----------
    bgt_df : pandas.DataFrame
    bodemfactor_gemeenten_path : str
        Pad naar CSV met bodemfactoren.
    db_connection : sqlite3.Connection

    Returns
    -------
    pandas.DataFrame
    """

    query = "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='bgt_with_bodemfactor';"

    if pd.read_sql_query(query, db_connection).iloc[0, 0] == 1:
        print("Table bgt_with_bodemfactor found. Loading data.")
        df = pd.read_sql_query("SELECT * FROM bgt_with_bodemfactor", db_connection)

    else:
        print("Table bgt_with_bodemfactor not found. Adding bodemfactor data.")

        bodemfactor_df = pd.read_csv(
            bodemfactor_gemeenten_path,
            sep=';',
            encoding='latin1',
            skiprows=5,
            usecols=[1, 2],
            names=['Naam', 'Bodemfactor']
        )

        bodemfactor_df = bodemfactor_df[['Naam', 'Bodemfactor']].fillna(1)

        df = bgt_df.join(
            bodemfactor_df.set_index('Naam'),
            on='Gemeentenaam'
        )

        df.to_sql("bgt_with_bodemfactor", db_connection, if_exists="replace", index=False)

    print(f"Rows in dataframe after add_bodemfactor_data: {len(df)}")

    return df


def add_dubocalc_data(bgt_df, dubocalc_df, db_connection):
    """
    Verrijkt BGT data met DuboCalc materiaaldata
    (CO2-emissie en MKI waarden).

    Parameters
    ----------
    bgt_df : pandas.DataFrame
    dubocalc_df : pandas.DataFrame
    db_connection : sqlite3.Connection

    Returns
    -------
    pandas.DataFrame
    """

    query = "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='bgt_with_dubocalc';"

    if pd.read_sql_query(query, db_connection).iloc[0, 0] == 1:
        print("Table bgt_with_dubocalc found. Loading data.")
        df = pd.read_sql_query("SELECT * FROM bgt_with_dubocalc", db_connection)

    else:
        print("Table bgt_with_dubocalc not found. Adding Dubocalc data.")

        # Kolomnamen opschonen
        dubocalc_df.columns = [x.replace(' ', '_') for x in dubocalc_df.columns]

        dubocalc_df = dubocalc_df[[
            'Element_niveau_3',
            'Element_niveau_5',
            'Element_niveau_7',
            'Element_niveau_8',
            'Element_niveau_9',
            'CO2-emissie_totaal_(kg_CO2-eq)',
            'MKI_totaal_excl._Cat._3_toeslag',
            'Eenheid',
            'Hoeveelheid_in_project',
            'Vervangingen_in_project',
            'Product'
        ]].iloc[1:, :]

        df = pd.merge(
            bgt_df,
            dubocalc_df,
            how='left',
            left_on=['BgtFunctie', 'BgtFysiekVoorkomen', 'PlusFysiekVoorkomen'],
            right_on=['Element_niveau_3', 'Element_niveau_5', 'Element_niveau_7']
        )

        df.to_sql("bgt_with_dubocalc", db_connection, if_exists="replace", index=False)

    print(f"Rows in dataframe after add_dubocalc_data: {len(df)}")

    return df


def finalize_data(bgt_df, db_connection, final_output_path):
    """
    Maakt de uiteindelijke dataset voor de CO2-monitor.

    Stappen:
    - selectie relevante kolommen
    - verwijderen duplicaten
    - afdwingen numerieke datatypes
    - export naar SQLite en CSV

    Parameters
    ----------
    bgt_df : pandas.DataFrame
    db_connection : sqlite3.Connection
    final_output_path : str

    Returns
    -------
    pandas.DataFrame
    """

    query = "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='bgt_final';"

    if pd.read_sql_query(query, db_connection).iloc[0, 0] == 1:
        print("Table bgt_final found. Loading data.")
        df = pd.read_sql_query("SELECT * FROM bgt_final", db_connection)

    else:
        print("Table bgt_final not found. Finalizing data.")

        bgt_df = bgt_df.fillna('')
        bgt_df["Naam"] = bgt_df["Gemeentenaam"].astype(str)

        df = bgt_df[
            ['Provincienaam', 'Bronhouder', 'Organisatietype', 'Naam',
             'BgtFunctie', 'BgtFysiekVoorkomen', 'PlusFysiekVoorkomen',
             'area', 'Bodemfactor',
             'Element_niveau_8', 'Element_niveau_9',
             'CO2-emissie_totaal_(kg_CO2-eq)',
             'MKI_totaal_excl._Cat._3_toeslag',
             'Eenheid', 'Hoeveelheid_in_project',
             'Vervangingen_in_project', 'Product']
        ]

        df = df.drop_duplicates()

        # Numerieke velden afdwingen
        df["CO2-emissie_totaal_(kg_CO2-eq)"] = pd.to_numeric(
            df["CO2-emissie_totaal_(kg_CO2-eq)"], errors='coerce'
        )

        df["MKI_totaal_excl._Cat._3_toeslag"] = pd.to_numeric(
            df["MKI_totaal_excl._Cat._3_toeslag"], errors='coerce'
        )

        df["Hoeveelheid_in_project"] = pd.to_numeric(
            df["Hoeveelheid_in_project"], errors='coerce'
        )

        df["Vervangingen_in_project"] = pd.to_numeric(
            df["Vervangingen_in_project"], errors='coerce'
        )

        # Opslaan in SQLite
        df.to_sql("bgt_final", db_connection, if_exists="replace", index=False)

        # Export CSV voor CO2 monitor
        df.to_csv(final_output_path, sep=';', index=False, decimal=',')

    print(f"Rows in dataframe after finalize_data: {len(df)}")

    return df


def main(base_path, delete_database=False):
    """
    Hoofdworkflow van het script.

    Parameters
    ----------
    base_path : str
        Map met alle bronbestanden.
    delete_database : bool
        Indien True wordt de SQLite database opnieuw opgebouwd.
    """

    script_dir = r"\\pds\cloud$\gis_projects\groupdata\igi\GD-items\GD-10324\bgt2co2_temp1"
    db_path = os.path.join(script_dir, "bgt_data.db")

    if delete_database and os.path.exists(db_path):
        os.remove(db_path)
        print("Database deleted.")

    db_connection = sqlite3.connect(db_path)

    bgt_wegen_nl_pattern = os.path.join(base_path, "*Bronbestand BGT_Wegen*.csv")
    gemeenten_alfabetisch_path = os.path.join(base_path, "2. Bronbestand gemeenten alfabetisch 2023.xlsx")
    bodemfactor_gemeenten_path = os.path.join(base_path, "1. Bronbestand bodemfactor gemeenten CBS.csv")
    dubocalc_path = os.path.join(base_path, "3. Bronbestand DuboCalc Nationale CO2 monitor.xlsx")

    # Stap 1: BGT data laden
    bgt_wegen_nl_df = load_or_process_data(bgt_wegen_nl_pattern, db_connection)

    # Stap 2: BGT data verwerken
    bgt_wegen_nl_df = process_bgt_data(bgt_wegen_nl_df, db_connection)

    # Stap 3: Gemeentegegevens koppelen
    gemeenten_alfabetisch_df = pd.read_excel(gemeenten_alfabetisch_path)
    bgt_wegen_nl_df = join_gemeenten_data(bgt_wegen_nl_df, gemeenten_alfabetisch_df, db_connection)

    # Stap 4: Bodemfactor toevoegen
    bgt_wegen_nl_df = add_bodemfactor_data(bgt_wegen_nl_df, bodemfactor_gemeenten_path, db_connection)

    final_output_path = os.path.join(base_path, "BGT_Wegen_NL_Final.csv")

    # Stap 5: Dubocalc data toevoegen
    try:
        dubocalc_df = pd.read_excel(dubocalc_path, skiprows=11)
        bgt_wegen_nl_df = add_dubocalc_data(bgt_wegen_nl_df, dubocalc_df, db_connection)
    except Exception as e:
        print(f"Error loading or processing Dubocalc data: {e}")

    # Stap 6: Einddataset maken
    bgt_wegen_nl_df = finalize_data(bgt_wegen_nl_df, db_connection, final_output_path)

    print(f"Final BGT data saved to {final_output_path}")


if __name__ == "__main__":
    base_path = r"\\pds\cloud$\gis_projects\groupdata\igi\GD-items\GD-10324\bronbestanden"

    main(base_path, delete_database=True)